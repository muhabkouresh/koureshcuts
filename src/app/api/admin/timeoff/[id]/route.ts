import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { timeOffSchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/time";
import {
  findConflictingAppointments,
  cancelConflictingAppointments,
  toConflictInfo,
} from "@/lib/timeoff";

// PUT /api/admin/timeoff/[id] — edit a blocked date range. Same conflict
// handling as creating one: active bookings in the NEW range trigger a 409
// unless onConflict is "cancel" or "keep".
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/admin/timeoff/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = timeOffSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Daten." }, { status: 400 });
  }
  const { startDate, endDate, reason, onConflict } = parsed.data;
  if (endDate < startDate) {
    return Response.json(
      { error: "Bis-Datum muss am/nach dem Von-Datum liegen." },
      { status: 400 },
    );
  }

  const existing = await prisma.timeOff.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const start = zonedToUtc(startDate, 0, siteConfig.timezone);
  const end = zonedToUtc(endDate, 24 * 60, siteConfig.timezone);

  const conflicts = await findConflictingAppointments(start, end);
  if (conflicts.length > 0 && onConflict === "abort") {
    return Response.json(
      {
        error: "In diesem Zeitraum gibt es bereits gebuchte Termine.",
        conflicts: toConflictInfo(conflicts),
      },
      { status: 409 },
    );
  }

  await prisma.timeOff.update({
    where: { id },
    data: { startDate: start, endDate: end, reason: reason ?? "" },
  });

  let cancelled = 0;
  let notified = 0;
  if (conflicts.length > 0 && onConflict === "cancel") {
    const res = await cancelConflictingAppointments(conflicts, reason ?? "");
    cancelled = res.cancelled;
    notified = res.notified;
  }

  return Response.json({ ok: true, cancelled, notified });
}

// DELETE /api/admin/timeoff/[id] — remove a blocked date range.
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/timeoff/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  await prisma.timeOff.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
