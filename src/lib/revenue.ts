import { formatInTimeZone } from "date-fns-tz";
import { de } from "date-fns/locale";
import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { addDaysToDateStr, dateKey, todayInTz, weekdayOf } from "./time";

// Revenue = sum of prices of appointments that have taken place (start time in
// the past and not cancelled), bucketed per week and per month in the shop
// timezone. No manual "erledigt" marking needed — past visits count automatically.

const tz = siteConfig.timezone;

export type RevenueBucket = { label: string; cents: number };
export type RevenueStats = {
  weeks: RevenueBucket[];
  months: RevenueBucket[];
  totalCents: number;
  thisWeekCents: number;
  thisMonthCents: number;
  // Manually logged product sales (see ProductSale), same buckets. Included
  // in the totals above so every figure is the full takings.
  productTotalCents: number;
  productWeekCents: number;
  productMonthCents: number;
  // No-shows: past appointments explicitly marked "nicht erschienen".
  noShowCount: number;
  noShowCents: number;
  // Expected revenue: booked, upcoming, not yet taken place.
  expectedCents: number;
  expectedCount: number;
  // Expected revenue within the next 7 days only.
  expectedWeekCents: number;
  expectedWeekCount: number;
};

/** Monday (YYYY-MM-DD) of the week containing `ds`. */
function mondayOf(ds: string): string {
  const offset = (weekdayOf(ds) + 6) % 7;
  return addDaysToDateStr(ds, -offset);
}

export async function getRevenueStats(): Promise<RevenueStats> {
  const rows = await prisma.appointment.findMany({
    where: {
      status: { notIn: ["CANCELLED", "NO_SHOW", "BLOCKED"] },
      startTime: { lt: new Date() },
    },
    select: { startTime: true, service: { select: { priceCents: true } } },
  });

  // Product sales are logged manually and count toward every bucket.
  const productRows = await prisma.productSale.findMany({
    select: { date: true, amountCents: true },
  });

  const totalCents =
    rows.reduce((s, r) => s + r.service.priceCents, 0) +
    productRows.reduce((s, r) => s + r.amountCents, 0);
  const productTotalCents = productRows.reduce((s, r) => s + r.amountCents, 0);

  // No-shows are counted separately (lost revenue), not part of the buckets.
  const noShowRows = await prisma.appointment.findMany({
    where: { status: "NO_SHOW" },
    select: { service: { select: { priceCents: true } } },
  });
  const noShowCount = noShowRows.length;
  const noShowCents = noShowRows.reduce((s, r) => s + r.service.priceCents, 0);

  // Expected revenue: everything booked and still ahead (incl. pending
  // approval — the slot is held either way).
  const upcomingRows = await prisma.appointment.findMany({
    where: {
      status: { in: ["CONFIRMED", "PENDING"] },
      startTime: { gte: new Date() },
    },
    select: { startTime: true, service: { select: { priceCents: true } } },
  });
  const expectedCount = upcomingRows.length;
  const expectedCents = upcomingRows.reduce(
    (s, r) => s + r.service.priceCents,
    0,
  );
  const weekAhead = Date.now() + 7 * 24 * 60 * 60_000;
  const weekRows = upcomingRows.filter(
    (r) => r.startTime.getTime() < weekAhead,
  );
  const expectedWeekCount = weekRows.length;
  const expectedWeekCents = weekRows.reduce(
    (s, r) => s + r.service.priceCents,
    0,
  );

  // Last 8 week-buckets (oldest → newest).
  const currentMonday = mondayOf(todayInTz(tz));
  const weekStarts = Array.from({ length: 8 }, (_, i) =>
    addDaysToDateStr(currentMonday, -7 * (7 - i)),
  );
  const weekMap = new Map<string, number>(weekStarts.map((w) => [w, 0]));

  // Last 6 month-buckets (oldest → newest).
  const curMonthKey = formatInTimeZone(new Date(), tz, "yyyy-MM");
  const [cy, cm] = curMonthKey.split("-").map(Number);
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    let m = cm - 1 - i;
    let y = cy;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    monthKeys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  const monthMap = new Map<string, number>(monthKeys.map((k) => [k, 0]));

  for (const r of rows) {
    const wk = mondayOf(dateKey(r.startTime, tz));
    if (weekMap.has(wk)) weekMap.set(wk, weekMap.get(wk)! + r.service.priceCents);
    const mk = formatInTimeZone(r.startTime, tz, "yyyy-MM");
    if (monthMap.has(mk))
      monthMap.set(mk, monthMap.get(mk)! + r.service.priceCents);
  }
  // Product sales land in the same buckets, so the charts show total takings.
  let productWeekCents = 0;
  let productMonthCents = 0;
  for (const p of productRows) {
    const wk = mondayOf(dateKey(p.date, tz));
    if (weekMap.has(wk)) weekMap.set(wk, weekMap.get(wk)! + p.amountCents);
    if (wk === currentMonday) productWeekCents += p.amountCents;
    const mk = formatInTimeZone(p.date, tz, "yyyy-MM");
    if (monthMap.has(mk)) monthMap.set(mk, monthMap.get(mk)! + p.amountCents);
    if (mk === curMonthKey) productMonthCents += p.amountCents;
  }

  const weeks: RevenueBucket[] = weekStarts.map((w) => ({
    label: formatInTimeZone(new Date(`${w}T12:00:00Z`), "UTC", "dd.MM."),
    cents: weekMap.get(w)!,
  }));
  const months: RevenueBucket[] = monthKeys.map((k) => ({
    label: formatInTimeZone(new Date(`${k}-01T12:00:00Z`), "UTC", "MMM yy", {
      locale: de,
    }),
    cents: monthMap.get(k)!,
  }));

  return {
    weeks,
    months,
    totalCents,
    thisWeekCents: weekMap.get(currentMonday) ?? 0,
    thisMonthCents: monthMap.get(curMonthKey) ?? 0,
    productTotalCents,
    productWeekCents,
    productMonthCents,
    noShowCount,
    noShowCents,
    expectedCents,
    expectedCount,
    expectedWeekCents,
    expectedWeekCount,
  };
}
