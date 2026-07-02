import type { NextRequest } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { BUSY_STATUSES, AppointmentStatus } from "@/lib/constants";
import { rescheduleAppointmentSchema } from "@/lib/validation";
import { getAvailability } from "@/lib/availability";
import { verifyCancelToken } from "@/lib/token";
import { sendRescheduleEmails } from "@/lib/email";
import { googleCalendarUrl } from "@/lib/calendar";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { notifyWaitlistForDay } from "@/lib/waitlist";
import { sendAdminPush } from "@/lib/push";
import { dateKey, formatDateTimeLabel } from "@/lib/time";

// POST /api/appointments/[id]/reschedule?t=<token>
// Public, token-guarded self-service reschedule: moves an active, upcoming
// appointment to a new free slot (same service, same customer).
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/appointments/[id]/reschedule">,
) {
  const limit = rateLimit(`resched:${clientIp(request)}`, 6, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t") ?? undefined;
  if (!verifyCancelToken(id, token)) {
    return Response.json({ error: "Ungültiger Link." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = rescheduleAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
    return Response.json({ error: message }, { status: 400 });
  }

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true },
  });
  if (!appt) {
    return Response.json({ error: "Termin nicht gefunden." }, { status: 404 });
  }
  const active =
    appt.status === AppointmentStatus.PENDING ||
    appt.status === AppointmentStatus.CONFIRMED;
  if (!active || appt.startTime <= new Date()) {
    return Response.json(
      {
        error:
          "Dieser Termin kann nicht mehr verschoben werden. Bitte buche einen neuen Termin oder melde dich direkt bei uns.",
      },
      { status: 409 },
    );
  }

  const start = new Date(parsed.data.start);
  const end = new Date(start.getTime() + appt.service.durationMinutes * 60_000);
  if (start.getTime() === appt.startTime.getTime()) {
    return Response.json(
      { error: "Das ist bereits deine aktuelle Terminzeit." },
      { status: 400 },
    );
  }
  const dateStr = formatInTimeZone(start, siteConfig.timezone, "yyyy-MM-dd");

  // Validate the new slot against current availability, ignoring the
  // customer's own booking (so shifting within the same day works).
  let isOpen = false;
  try {
    const availability = await getAvailability(appt.serviceId, dateStr, id);
    isOpen = availability.slots.some((s) => s.start === start.toISOString());
  } catch {
    return Response.json({ error: "Ungültige Terminzeit." }, { status: 400 });
  }
  if (!isOpen) {
    return Response.json(
      {
        error:
          "Diese Zeit ist leider nicht mehr verfügbar. Bitte wähle eine andere Uhrzeit.",
      },
      { status: 409 },
    );
  }

  const oldStart = appt.startTime;
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const clash = await tx.appointment.findFirst({
              where: {
                id: { not: id },
                status: { in: BUSY_STATUSES },
                startTime: { lt: end },
                endTime: { gt: start },
              },
              select: { id: true },
            });
            if (clash) {
              throw new Error("SLOT_TAKEN");
            }
            await tx.appointment.update({
              where: { id },
              data: {
                startTime: start,
                endTime: end,
                // The reminder refers to the old time — allow a fresh one.
                reminderSentAt: null,
              },
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
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return Response.json(
        {
          error:
            "Diese Zeit wurde gerade eben vergeben. Bitte wähle eine andere Uhrzeit.",
        },
        { status: 409 },
      );
    }
    console.error("reschedule error", err);
    return Response.json(
      { error: "Termin konnte nicht verschoben werden. Bitte erneut versuchen." },
      { status: 500 },
    );
  }

  // Notifications are best-effort — the reschedule itself already succeeded.
  try {
    await sendRescheduleEmails(
      {
        id: appt.id,
        customerName: appt.customerName,
        customerEmail: appt.customerEmail,
        serviceName: appt.service.name,
        priceCents: appt.service.priceCents,
        start,
        end,
      },
      oldStart,
    );
  } catch (err) {
    console.error("reschedule email failed", err);
  }

  // The old day gained a free slot — tell anyone waiting for it.
  const tz = siteConfig.timezone;
  if (dateKey(oldStart, tz) !== dateKey(start, tz)) {
    try {
      await notifyWaitlistForDay(oldStart);
    } catch (err) {
      console.error("waitlist auto-notify failed", err);
    }
  }

  try {
    await sendAdminPush(
      "Termin verschoben",
      `${appt.customerName} — ${appt.service.name}: ${formatDateTimeLabel(oldStart, tz)} → ${formatDateTimeLabel(start, tz)}`,
    );
  } catch (err) {
    console.error("reschedule push failed", err);
  }

  const gcalUrl = googleCalendarUrl({
    title: `${appt.service.name} — ${siteConfig.name}`,
    description: `Dein Termin (${appt.service.name}) bei ${siteConfig.name}. Zahlung vor Ort.`,
    location: siteConfig.address,
    start,
    end,
  });

  return Response.json({
    id: appt.id,
    serviceName: appt.service.name,
    priceCents: appt.service.priceCents,
    start: start.toISOString(),
    end: end.toISOString(),
    icsUrl: `/api/appointments/${appt.id}/ics`,
    gcalUrl,
  });
}
