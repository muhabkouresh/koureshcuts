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

// POST /api/admin/timeoff — block a date range (vacation / day off).
// If active bookings exist in the range, the default response is 409 with the
// conflict list; the admin then re-submits with onConflict "cancel" (cancel +
// email the customers) or "keep" (block the days, bookings stay).
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

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

  // Store as [start-of-startDate, end-of-endDate) in the shop timezone so the
  // whole range of calendar days is blocked.
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

  const created = await prisma.timeOff.create({
    data: { startDate: start, endDate: end, reason: reason ?? "" },
  });

  let cancelled = 0;
  let notified = 0;
  if (conflicts.length > 0 && onConflict === "cancel") {
    const res = await cancelConflictingAppointments(conflicts, reason ?? "");
    cancelled = res.cancelled;
    notified = res.notified;
  }

  return Response.json(
    { ok: true, id: created.id, cancelled, notified },
    { status: 201 },
  );
}
