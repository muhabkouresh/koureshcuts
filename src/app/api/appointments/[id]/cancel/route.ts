import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppointmentStatus } from "@/lib/constants";
import { verifyCancelToken } from "@/lib/token";
import { sendCancellationNotice } from "@/lib/email";

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

  return Response.json({ ok: true });
}
