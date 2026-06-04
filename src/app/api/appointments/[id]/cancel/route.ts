import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppointmentStatus } from "@/lib/constants";
import { verifyCancelToken } from "@/lib/token";

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

  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) {
    return Response.json({ error: "Termin nicht gefunden." }, { status: 404 });
  }
  if (appt.status === AppointmentStatus.CANCELLED) {
    return Response.json({ ok: true, alreadyCancelled: true });
  }

  await prisma.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.CANCELLED },
  });
  return Response.json({ ok: true });
}
