import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { emergencyCloseSchema } from "@/lib/validation";
import { zonedToUtc, todayInTz, addDaysToDateStr } from "@/lib/time";
import {
  findConflictingAppointments,
  cancelConflictingAppointments,
} from "@/lib/timeoff";

// Cancelling + emailing a full day of customers takes a while.
export const maxDuration = 60;

// POST /api/admin/emergency-close — the Notfall-Knopf: block today (or today
// + tomorrow) with an emergency TimeOff (public site shows a red banner),
// cancel every remaining active appointment in the range and email the
// affected customers, all in one step. Reopening = deleting the TimeOff entry
// under Verfügbarkeit → Abwesenheiten.
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
  const parsed = emergencyCloseSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Daten." }, { status: 400 });
  }
  const { days, reason } = parsed.data;

  const tz = siteConfig.timezone;
  const today = todayInTz(tz);
  const lastDay = addDaysToDateStr(today, days - 1);
  const start = zonedToUtc(today, 0, tz);
  const end = zonedToUtc(lastDay, 24 * 60, tz);

  // Find conflicts first, then block the days — the block must exist even if
  // some cancellation emails fail afterwards.
  const conflicts = await findConflictingAppointments(start, end);
  await prisma.timeOff.create({
    data: {
      startDate: start,
      endDate: end,
      reason: reason || "Kurzfristig geschlossen",
      emergency: true,
    },
  });
  const { cancelled, notified } = await cancelConflictingAppointments(
    conflicts,
    reason,
  );

  return Response.json({ ok: true, cancelled, notified });
}
