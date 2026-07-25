import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { dateKey, zonedToUtc, formatLongDate, formatClock } from "./time";
import { sendWaitlistSpotEmail } from "./email";
import { sendCustomerPushForDay } from "./push";

// Re-notify a waiting customer at most once per day, so a week of cancellations
// can't turn into a mail flood — but a single early "spot free" mail also never
// silences them forever (which is what a permanent notifiedAt flag did).
const RENOTIFY_AFTER_MS = 24 * 60 * 60_000;

/**
 * A slot freed up (cancellation, shop cancellation, reschedule, unblock) —
 * tell everyone who could use it. Reached are:
 *   • entries waiting for exactly this day, and
 *   • flexible entries ("next free slot") whose weekday preference fits —
 *     these used to get nothing but a push, which almost no one has enabled.
 * The mail names the exact freed time so it's obvious what to grab.
 * "Termin-Radar" push devices watching the day are notified as well.
 * Never throws on a single failed send; notifiedAt is stamped only on success
 * so a failed delivery is retried on the next opening.
 */
export async function notifyWaitlistForDay(freedAt: Date): Promise<number> {
  const tz = siteConfig.timezone;
  const ds = dateKey(freedAt, tz);
  const dayStart = zonedToUtc(ds, 0, tz);
  const dayEnd = zonedToUtc(ds, 24 * 60, tz);
  // 0 = Sunday … 6 = Saturday, matching WaitlistEntry.weekdays (CSV).
  const weekday = String(new Date(dayStart).getUTCDay());

  // Push first — it's the faster channel, and it never throws.
  await sendCustomerPushForDay(dayStart, dayEnd, formatLongDate(freedAt, tz));

  const cutoff = new Date(Date.now() - RENOTIFY_AFTER_MS);
  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      AND: [
        {
          OR: [
            // Waiting for exactly this day.
            { date: { gte: dayStart, lt: dayEnd } },
            // Flexible: any day, or a weekday list containing this weekday.
            { date: null },
          ],
        },
        { OR: [{ notifiedAt: null }, { notifiedAt: { lt: cutoff } }] },
      ],
    },
    include: { service: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Weekday filtering for flexible entries can't be expressed in the query
  // (weekdays is a CSV string), so it happens here. Empty = every day is fine.
  const entries = candidates.filter((e) => {
    if (e.date) return true;
    if (!e.weekdays) return true;
    return e.weekdays.split(",").includes(weekday);
  });

  const dayLabel = formatLongDate(freedAt, tz);
  const timeLabel = formatClock(freedAt, tz);

  let notified = 0;
  for (const entry of entries) {
    let ok = false;
    try {
      const res = await sendWaitlistSpotEmail({
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        serviceName: entry.service.name,
        date: entry.date,
        freedDayLabel: dayLabel,
        freedTimeLabel: timeLabel,
      });
      ok = res.ok;
    } catch (err) {
      console.error("auto waitlist notify failed", err);
    }
    if (ok) {
      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { notifiedAt: new Date() },
      });
      notified += 1;
    }
  }
  return notified;
}
