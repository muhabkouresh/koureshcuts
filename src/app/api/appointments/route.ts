import type { NextRequest } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import {
  ACTIVE_STATUSES,
  BUSY_STATUSES,
  AppointmentStatus,
} from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import { createAppointmentSchema } from "@/lib/validation";
import { getAvailability } from "@/lib/availability";
import { sendConfirmationEmails } from "@/lib/email";
import { googleCalendarUrl } from "@/lib/calendar";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { sendAdminPush } from "@/lib/push";
import { formatDateTimeLabel } from "@/lib/time";

// POST /api/appointments — create a guest booking.
export async function POST(request: NextRequest) {
  // Throttle booking bursts per IP: max 6 attempts per 10 minutes.
  const limit = rateLimit(`book:${clientIp(request)}`, 6, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = createAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
    return Response.json({ error: message }, { status: 400 });
  }
  const input = parsed.data;

  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
  });
  if (!service || !service.active) {
    return Response.json({ error: "Service nicht gefunden." }, { status: 400 });
  }

  // Manually blocked by the shop owner (admin blocklist).
  const manuallyBlocked = await prisma.blockedCustomer.findUnique({
    where: { email: input.customerEmail.toLowerCase() },
    select: { id: true },
  });
  if (manuallyBlocked) {
    return Response.json(
      {
        error:
          "Online-Buchung ist für diese E-Mail-Adresse nicht möglich. Bitte melde dich direkt bei uns im Shop.",
      },
      { status: 403 },
    );
  }

  const settings = await getSettings();

  // Repeated no-shows lose the online-booking privilege (walk-in/call only).
  // The threshold is an admin setting; 0 disables the automatic block.
  if (settings.noShowBlockThreshold > 0) {
    const noShows = await prisma.appointment.count({
      where: {
        customerEmail: { equals: input.customerEmail, mode: "insensitive" },
        status: AppointmentStatus.NO_SHOW,
      },
    });
    if (noShows >= settings.noShowBlockThreshold) {
      return Response.json(
        {
          error:
            "Online-Buchung ist für diese E-Mail-Adresse leider nicht mehr möglich, da mehrere Termine nicht wahrgenommen wurden. Bitte melde dich direkt bei uns im Shop.",
        },
        { status: 403 },
      );
    }
  }

  // Optional cap: at most N upcoming bookings per email so nobody hoards
  // slots when the calendar is nearly full (0 = unlimited).
  if (settings.maxActiveBookingsPerEmail > 0) {
    const upcoming = await prisma.appointment.count({
      where: {
        customerEmail: { equals: input.customerEmail, mode: "insensitive" },
        status: { in: ACTIVE_STATUSES },
        startTime: { gt: new Date() },
      },
    });
    if (upcoming >= settings.maxActiveBookingsPerEmail) {
      return Response.json(
        {
          error: `Mit dieser E-Mail-Adresse ${
            settings.maxActiveBookingsPerEmail === 1
              ? "ist bereits ein offener Termin"
              : `sind bereits ${upcoming} offene Termine`
          } gebucht (Maximum: ${settings.maxActiveBookingsPerEmail}). Bitte nimm den bestehenden Termin wahr oder sage ihn ab.`,
        },
        { status: 403 },
      );
    }
  }

  const start = new Date(input.start);
  const end = new Date(start.getTime() + service.durationMinutes * 60_000);
  const dateStr = formatInTimeZone(start, siteConfig.timezone, "yyyy-MM-dd");

  // Re-validate the requested slot against current availability (hours, lead
  // time, booking window, time-off, and existing bookings).
  let isOpen = false;
  try {
    const availability = await getAvailability(input.serviceId, dateStr);
    isOpen = availability.slots.some((s) => s.start === start.toISOString());
  } catch {
    return Response.json({ error: "Ungültige Terminzeit." }, { status: 400 });
  }
  if (!isOpen) {
    return Response.json(
      {
        error:
          "Dieser Termin ist leider nicht mehr verfügbar. Bitte wähle eine andere Uhrzeit.",
      },
      { status: 409 },
    );
  }

  // Create inside a Serializable transaction with a final overlap check so two
  // simultaneous bookings of the same slot cannot both pass the check. On a
  // serialization conflict (P2034) the attempt is retried.
  let appointmentId: string;
  try {
    let created: { id: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        created = await prisma.$transaction(
          async (tx) => {
            const clash = await tx.appointment.findFirst({
              where: {
                status: { in: BUSY_STATUSES },
                startTime: { lt: end },
                endTime: { gt: start },
              },
              select: { id: true },
            });
            if (clash) {
              throw new Error("SLOT_TAKEN");
            }
            return tx.appointment.create({
              data: {
                serviceId: service.id,
                customerName: input.customerName,
                customerEmail: input.customerEmail,
                customerPhone: input.customerPhone,
                notes: input.notes ?? "",
                startTime: start,
                endTime: end,
                status: AppointmentStatus.CONFIRMED,
              },
              select: { id: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (err) {
        const retriable =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2034";
        if (retriable && attempt < 3) continue;
        throw err;
      }
    }
    if (!created) throw new Error("SLOT_TAKEN");
    appointmentId = created.id;
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return Response.json(
        {
          error:
            "Dieser Termin wurde gerade eben vergeben. Bitte wähle eine andere Uhrzeit.",
        },
        { status: 409 },
      );
    }
    console.error("booking error", err);
    return Response.json(
      { error: "Buchung konnte nicht angelegt werden. Bitte erneut versuchen." },
      { status: 500 },
    );
  }

  // Send confirmation emails; never fail the booking if email delivery hiccups.
  try {
    await sendConfirmationEmails({
      id: appointmentId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      serviceName: service.name,
      priceCents: service.priceCents,
      start,
      end,
    });
  } catch (err) {
    console.error("confirmation email failed", err);
  }

  // Push to the admin PWA (best-effort).
  try {
    await sendAdminPush(
      "Neue Buchung",
      `${input.customerName} — ${service.name}, ${formatDateTimeLabel(start, siteConfig.timezone)}`,
    );
  } catch (err) {
    console.error("booking push failed", err);
  }

  const gcalUrl = googleCalendarUrl({
    title: `${service.name} — ${siteConfig.name}`,
    description: `Dein Termin (${service.name}) bei ${siteConfig.name}. Zahlung vor Ort.`,
    location: siteConfig.address,
    start,
    end,
  });

  return Response.json(
    {
      id: appointmentId,
      serviceName: service.name,
      priceCents: service.priceCents,
      start: start.toISOString(),
      end: end.toISOString(),
      icsUrl: `/api/appointments/${appointmentId}/ics`,
      gcalUrl,
    },
    { status: 201 },
  );
}
