import type { NextRequest } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { ACTIVE_STATUSES, AppointmentStatus } from "@/lib/constants";
import { createAppointmentSchema } from "@/lib/validation";
import { getAvailability } from "@/lib/availability";
import { sendConfirmationEmails } from "@/lib/email";
import { googleCalendarUrl } from "@/lib/calendar";
import { rateLimit, clientIp } from "@/lib/rateLimit";

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
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return Response.json({ error: message }, { status: 400 });
  }
  const input = parsed.data;

  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
  });
  if (!service || !service.active) {
    return Response.json({ error: "Service not found." }, { status: 400 });
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
    return Response.json({ error: "Invalid appointment time." }, { status: 400 });
  }
  if (!isOpen) {
    return Response.json(
      { error: "That time is no longer available. Please pick another slot." },
      { status: 409 },
    );
  }

  // Create inside a transaction with a final overlap check to guard against a
  // race between two simultaneous bookings of the same slot.
  let appointmentId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const clash = await tx.appointment.findFirst({
        where: {
          status: { in: ACTIVE_STATUSES },
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
    });
    appointmentId = created.id;
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return Response.json(
        { error: "That time was just booked. Please pick another slot." },
        { status: 409 },
      );
    }
    console.error("booking error", err);
    return Response.json({ error: "Could not create booking." }, { status: 500 });
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
