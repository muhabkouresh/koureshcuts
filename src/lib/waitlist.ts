import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { dateKey, zonedToUtc, formatLongDate } from "./time";
import { sendWaitlistSpotEmail } from "./email";
import { sendCustomerPushForDay } from "./push";

// When a slot frees up on a given day (e.g. an appointment was cancelled),
// notify everyone still waiting for that day that a spot opened up. First to
// re-book gets it. Only not-yet-notified entries are contacted, and notifiedAt
// is stamped only on a successful send (so a failed delivery retries later).
// "Termin-Radar" push devices watching the day are notified as well.
export async function notifyWaitlistForDay(dayInstant: Date): Promise<number> {
  const tz = siteConfig.timezone;
  const ds = dateKey(dayInstant, tz);
  const dayStart = zonedToUtc(ds, 0, tz);
  const dayEnd = zonedToUtc(ds, 24 * 60, tz);

  // Push first — it's the faster channel, and it never throws.
  await sendCustomerPushForDay(dayStart, dayEnd, formatLongDate(dayInstant, tz));

  const entries = await prisma.waitlistEntry.findMany({
    where: { date: { gte: dayStart, lt: dayEnd }, notifiedAt: null },
    include: { service: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  let notified = 0;
  for (const entry of entries) {
    let ok = false;
    try {
      const res = await sendWaitlistSpotEmail({
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        serviceName: entry.service.name,
        date: entry.date,
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
