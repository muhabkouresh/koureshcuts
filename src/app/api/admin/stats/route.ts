import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { addDaysToDateStr, todayInTz } from "@/lib/time";

// GET /api/admin/stats — visitor analytics for the Statistik tab, aggregated
// from the privacy-light PageView beacon: daily series, totals, top pages,
// referrer sources, device split, and booking conversion.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const tz = siteConfig.timezone;
  const today = todayInTz(tz);
  const firstDay = addDaysToDateStr(today, -29);

  const [views, bookings7, bookings30] = await Promise.all([
    prisma.pageView.findMany({
      where: { day: { gte: firstDay } },
      select: {
        day: true,
        path: true,
        referrer: true,
        device: true,
        visitor: true,
      },
    }),
    prisma.appointment.count({
      where: {
        status: { not: "BLOCKED" },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
      },
    }),
    prisma.appointment.count({
      where: {
        status: { not: "BLOCKED" },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
      },
    }),
  ]);

  // Daily series (last 30 days, oldest → newest).
  const days = Array.from({ length: 30 }, (_, i) =>
    addDaysToDateStr(firstDay, i),
  );
  const byDay = new Map(
    days.map((d) => [d, { views: 0, visitors: new Set<string>() }]),
  );
  const paths = new Map<string, number>();
  const referrers = new Map<string, number>();
  const devices = new Map<string, number>();
  const uniq7 = new Set<string>();
  const uniq30 = new Set<string>();
  const day7 = addDaysToDateStr(today, -6);
  let views7 = 0;

  for (const v of views) {
    const bucket = byDay.get(v.day);
    if (bucket) {
      bucket.views += 1;
      bucket.visitors.add(v.visitor);
    }
    paths.set(v.path, (paths.get(v.path) ?? 0) + 1);
    if (v.referrer) referrers.set(v.referrer, (referrers.get(v.referrer) ?? 0) + 1);
    if (v.device) devices.set(v.device, (devices.get(v.device) ?? 0) + 1);
    // Visitor hashes rotate daily — prefix with the day to count day-uniques.
    uniq30.add(`${v.day}|${v.visitor}`);
    if (v.day >= day7) {
      uniq7.add(`${v.day}|${v.visitor}`);
      views7 += 1;
    }
  }

  const todayBucket = byDay.get(today);
  const top = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count }));

  return Response.json({
    today: {
      views: todayBucket?.views ?? 0,
      visitors: todayBucket?.visitors.size ?? 0,
    },
    week: { views: views7, visitors: uniq7.size },
    month: { views: views.length, visitors: uniq30.size },
    daily: days.map((d) => ({
      day: d,
      views: byDay.get(d)!.views,
      visitors: byDay.get(d)!.visitors.size,
    })),
    topPaths: top(paths),
    topReferrers: top(referrers),
    devices: top(devices),
    bookings: { week: bookings7, month: bookings30 },
  });
}
