import { formatInTimeZone } from "date-fns-tz";
import { de } from "date-fns/locale";
import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { addDaysToDateStr, dateKey, todayInTz, weekdayOf } from "./time";

// Revenue = sum of prices of COMPLETED ("erledigt") appointments, bucketed per
// week and per month in the shop timezone.

const tz = siteConfig.timezone;

export type RevenueBucket = { label: string; cents: number };
export type RevenueStats = {
  weeks: RevenueBucket[];
  months: RevenueBucket[];
  totalCents: number;
  thisWeekCents: number;
  thisMonthCents: number;
};

/** Monday (YYYY-MM-DD) of the week containing `ds`. */
function mondayOf(ds: string): string {
  const offset = (weekdayOf(ds) + 6) % 7;
  return addDaysToDateStr(ds, -offset);
}

export async function getRevenueStats(): Promise<RevenueStats> {
  const rows = await prisma.appointment.findMany({
    where: { status: "COMPLETED" },
    select: { startTime: true, service: { select: { priceCents: true } } },
  });

  const totalCents = rows.reduce((s, r) => s + r.service.priceCents, 0);

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
  };
}
