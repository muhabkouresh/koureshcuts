import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppointmentStatus } from "@/lib/constants";
import { verifyCancelToken } from "@/lib/token";
import { sendCancellationNotice } from "@/lib/email";
import { processFreedSlot } from "@/lib/queue";
import { sendAdminPush } from "@/lib/push";
import { siteConfig } from "@/config/site";
import { formatDateTimeLabel } from "@/lib/time";
import { getSettings } from "@/lib/settings";

// POST /api/appointments/[id]/cancel?t=<token>
// Public, token-guarded self-cancellation for customers.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/appointments/[id]/cancel">,
) {
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t") ?? undefined;

  if (!verifyCancelToken(id, token)) {
    return Response.json({ error: "Ungültiger Link." }, { status: 403 });
  }

  // A cancellation reason is required.
  let reason = "";
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason === "string") reason = body.reason.trim();
  } catch {
    // No/invalid body — treated as missing reason below.
  }
  if (reason.length < 3) {
    return Response.json(
      { error: "Bitte gib einen Grund für die Absage an." },
      { status: 400 },
    );
  }
  if (reason.length > 500) reason = reason.slice(0, 500);

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true },
  });
  if (!appt) {
    return Response.json({ error: "Termin nicht gefunden." }, { status: 404 });
  }
  if (appt.status === AppointmentStatus.CANCELLED) {
    return Response.json({ ok: true, alreadyCancelled: true });
  }
  // Only upcoming, still-active bookings may be cancelled — a COMPLETED or
  // NO_SHOW appointment must keep its status (revenue/statistics), and past
  // appointments can't be "freed up" anymore.
  const active =
    appt.status === AppointmentStatus.PENDING ||
    appt.status === AppointmentStatus.CONFIRMED;
  if (!active || appt.startTime <= new Date()) {
    return Response.json(
      {
        error:
          "Dieser Termin liegt in der Vergangenheit oder kann nicht mehr online storniert werden. Bitte melde dich direkt bei uns.",
      },
      { status: 409 },
    );
  }
  // Optional cancellation deadline (admin setting): online cancelling closes
  // this many hours before the start.
  const settings = await getSettings();
  if (
    settings.cancelDeadlineHours > 0 &&
    appt.startTime.getTime() - settings.cancelDeadlineHours * 3600_000 <=
      Date.now()
  ) {
    return Response.json(
      {
        error: `Online-Absagen sind nur bis ${settings.cancelDeadlineHours} Stunden vor dem Termin möglich. Bitte melde dich direkt bei uns.`,
      },
      { status: 409 },
    );
  }

  const newNotes =
    (appt.notes ? `${appt.notes}\n` : "") + `Absagegrund: ${reason}`;

  await prisma.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.CANCELLED, notes: newNotes },
  });

  // Let the owner know the slot freed up (never fail the cancel on email error).
  try {
    await sendCancellationNotice(
      {
        id: appt.id,
        customerName: appt.customerName,
        customerEmail: appt.customerEmail,
        serviceName: appt.service.name,
        priceCents: appt.service.priceCents,
        start: appt.startTime,
        end: appt.endTime,
      },
      reason,
    );
  } catch (err) {
    console.error("cancellation notice failed", err);
  }

  // A spot opened up — offer it exclusively to the next person in the queue.
  await processFreedSlot(appt.startTime);

  // Push to the admin PWA (best-effort).
  try {
    await sendAdminPush(
      "Termin storniert",
      `${appt.customerName} — ${appt.service.name}, ${formatDateTimeLabel(appt.startTime, siteConfig.timezone)}`,
    );
  } catch (err) {
    console.error("cancel push failed", err);
  }

  return Response.json({ ok: true });
}
