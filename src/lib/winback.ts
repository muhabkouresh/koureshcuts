import { prisma } from "./prisma";
import { ACTIVE_STATUSES, AppointmentStatus } from "./constants";
import { sendWinbackEmail } from "./email";

// Automatic "we miss you" emails, run by the daily cron. A customer qualifies
// when their last visit is more than `winbackWeeks` weeks ago, they have no
// upcoming appointment, aren't blocked/opted out, and haven't already received
// a winback mail for this lapse (WinbackLog per email, reset by a new visit).
export async function runWinback(winbackWeeks: number): Promise<number> {
  if (winbackWeeks <= 0) return 0;
  const now = Date.now();
  const cutoff = new Date(now - winbackWeeks * 7 * 24 * 60 * 60_000);

  const [visits, upcoming, optOuts, blocked, reviewList, logs] =
    await Promise.all([
      prisma.appointment.findMany({
        where: {
          customerEmail: { not: "" },
          startTime: { lt: new Date(now) },
          status: {
            in: [AppointmentStatus.COMPLETED, AppointmentStatus.CONFIRMED],
          },
        },
        select: { customerEmail: true, customerName: true, startTime: true },
      }),
      prisma.appointment.findMany({
        where: {
          customerEmail: { not: "" },
          startTime: { gte: new Date(now) },
          status: { in: ACTIVE_STATUSES },
        },
        select: { customerEmail: true },
      }),
      prisma.emailOptOut.findMany({ select: { email: true } }),
      prisma.blockedCustomer.findMany({ select: { email: true } }),
      prisma.reviewCustomer.findMany({ select: { email: true } }),
      prisma.winbackLog.findMany(),
    ]);

  const skip = new Set([
    ...optOuts.map((o) => o.email),
    ...blocked.map((b) => b.email),
    ...reviewList.map((r) => r.email),
  ]);
  const hasUpcoming = new Set(
    upcoming.map((a) => a.customerEmail.toLowerCase()),
  );
  const logByEmail = new Map(logs.map((l) => [l.email, l.sentAt]));

  // Latest past visit per customer (case-insensitive email key).
  const lastVisit = new Map<
    string,
    { name: string; email: string; at: Date }
  >();
  for (const v of visits) {
    const key = v.customerEmail.toLowerCase();
    const prev = lastVisit.get(key);
    if (!prev || v.startTime > prev.at) {
      lastVisit.set(key, {
        name: v.customerName,
        email: v.customerEmail,
        at: v.startTime,
      });
    }
  }

  let sent = 0;
  for (const [key, v] of lastVisit) {
    if (sent >= 20) break; // protect the daily email quota
    if (v.at > cutoff) continue; // visited recently
    if (hasUpcoming.has(key)) continue; // already coming back
    if (skip.has(key)) continue;
    const lastLog = logByEmail.get(key);
    if (lastLog && lastLog >= v.at) continue; // this lapse was already mailed

    try {
      const res = await sendWinbackEmail(v.name, v.email);
      if (res.ok) {
        await prisma.winbackLog.upsert({
          where: { email: key },
          update: { sentAt: new Date() },
          create: { email: key, sentAt: new Date() },
        });
        sent += 1;
      }
    } catch (err) {
      console.error(`winback mail failed for ${key}`, err);
    }
  }
  return sent;
}
