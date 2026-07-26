import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { BUSY_STATUSES, SLOT_INTERVAL_MINUTES } from "./constants";
import { addDaysToDateStr, dateKey, todayInTz, weekdayOf, zonedToUtc } from "./time";

// Shared capacity maths for the capacity warning (cron) and the opening-hours
// recommendation (Statistik tab). "Capacity" is counted in 30-minute slots
// derived from the weekly hours plus public extra days, minus blocked days.

const tz = siteConfig.timezone;

export type DayLoad = {
  /** "yyyy-MM-dd" in the shop timezone. */
  date: string;
  /** Bookable 30-minute slots the day offers in total. */
  capacity: number;
  /** Slots already taken by active bookings or manual blocks. */
  booked: number;
};

/** Slots per day for a date range, together with how many are taken. */
export async function getDayLoads(
  fromDate: string,
  days: number,
): Promise<DayLoad[]> {
  const rangeStart = zonedToUtc(fromDate, 0, tz);
  const rangeEnd = zonedToUtc(addDaysToDateStr(fromDate, days), 0, tz);

  const [hours, timeOffs, specialDays, appointments] = await Promise.all([
    prisma.businessHours.findMany(),
    prisma.timeOff.findMany({
      where: { startDate: { lt: rangeEnd }, endDate: { gte: rangeStart } },
      select: { startDate: true, endDate: true },
    }),
    prisma.specialDay.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      select: { date: true, openMinute: true, closeMinute: true, isPublic: true },
    }),
    prisma.appointment.findMany({
      where: {
        status: { in: BUSY_STATUSES },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  const hoursByDay = new Map(hours.map((h) => [h.dayOfWeek, h]));
  const out: DayLoad[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDaysToDateStr(fromDate, i);
    const dayStart = zonedToUtc(date, 0, tz);
    const dayEnd = zonedToUtc(date, 24 * 60, tz);

    // A blocked day offers nothing at all.
    if (timeOffs.some((t) => t.startDate < dayEnd && t.endDate >= dayStart)) {
      out.push({ date, capacity: 0, booked: 0 });
      continue;
    }

    // Same union rule as the availability engine: an extra day ADDS hours.
    const ranges: Array<[number, number]> = [];
    const special = specialDays.find(
      (s) => s.date >= dayStart && s.date < dayEnd,
    );
    if (special && special.closeMinute > special.openMinute) {
      ranges.push([special.openMinute, special.closeMinute]);
    }
    const weekly = hoursByDay.get(weekdayOf(date));
    if (weekly && !weekly.isClosed && weekly.closeMinute > weekly.openMinute) {
      ranges.push([weekly.openMinute, weekly.closeMinute]);
    }

    const minutes = new Set<number>();
    for (const [open, close] of ranges) {
      for (let m = open; m + SLOT_INTERVAL_MINUTES <= close; m += SLOT_INTERVAL_MINUTES) {
        minutes.add(m);
      }
    }

    let booked = 0;
    for (const m of minutes) {
      const s = zonedToUtc(date, m, tz).getTime();
      const e = s + SLOT_INTERVAL_MINUTES * 60_000;
      if (
        appointments.some(
          (a) => a.startTime.getTime() < e && a.endTime.getTime() > s,
        )
      ) {
        booked++;
      }
    }
    out.push({ date, capacity: minutes.size, booked });
  }
  return out;
}

export type CapacityOutlook = {
  capacity: number;
  booked: number;
  free: number;
  /** 0–100; 0 when there is no capacity at all. */
  percent: number;
};

/** Utilisation across the next `days` days, starting tomorrow. */
export async function getUpcomingLoad(days = 7): Promise<CapacityOutlook> {
  const from = addDaysToDateStr(todayInTz(tz), 1);
  const loads = await getDayLoads(from, days);
  const capacity = loads.reduce((s, d) => s + d.capacity, 0);
  const booked = loads.reduce((s, d) => s + d.booked, 0);
  return {
    capacity,
    booked,
    free: capacity - booked,
    percent: capacity === 0 ? 0 : Math.round((booked / capacity) * 100),
  };
}

export type HoursSuggestion = {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Utilisation of this weekday over the analysed period, 0–100. */
  percent: number;
  /** Bookings that were turned away: waitlist entries for this weekday. */
  waitlist: number;
  /** Slots that were bookable on this weekday in the period. */
  capacity: number;
  /** Estimated extra appointments per month if two hours were added. */
  potentialPerMonth: number;
};

export type HoursAnalysis = {
  /** Weekdays sorted by pressure (highest first). */
  suggestions: HoursSuggestion[];
  /** Days analysed. */
  daysAnalysed: number;
  overallPercent: number;
};

/**
 * Which weekday is under the most pressure — the basis for "opening two hours
 * longer on Friday would have brought N more appointments". Combines how full
 * the day already is with how many people asked for it on the waitlist.
 */
export async function analyseHours(daysBack = 60): Promise<HoursAnalysis> {
  const today = todayInTz(tz);
  const from = addDaysToDateStr(today, -daysBack);
  const loads = await getDayLoads(from, daysBack);

  const waitlist = await prisma.waitlistEntry.findMany({
    select: { date: true, weekdays: true },
  });

  const byWeekday = new Map<number, { capacity: number; booked: number }>();
  for (const d of loads) {
    if (d.capacity === 0) continue;
    const wd = weekdayOf(d.date);
    const acc = byWeekday.get(wd) ?? { capacity: 0, booked: 0 };
    acc.capacity += d.capacity;
    acc.booked += d.booked;
    byWeekday.set(wd, acc);
  }

  // Waitlist demand per weekday: a dated wish counts for its own weekday, a
  // flexible entry for each weekday it accepts.
  const wlByWeekday = new Map<number, number>();
  for (const w of waitlist) {
    const add = (wd: number) =>
      wlByWeekday.set(wd, (wlByWeekday.get(wd) ?? 0) + 1);
    if (w.date) {
      add(weekdayOf(dateKey(w.date, tz)));
    } else if (w.weekdays) {
      for (const part of w.weekdays.split(",")) add(Number(part));
    } else {
      for (let wd = 0; wd < 7; wd++) add(wd);
    }
  }

  const weeksAnalysed = daysBack / 7;
  const suggestions: HoursSuggestion[] = [...byWeekday.entries()].map(
    ([weekday, acc]) => {
      const percent = Math.round((acc.booked / acc.capacity) * 100);
      // Two extra hours = 4 slots per occurrence; assume they fill at the same
      // rate the day already achieves, capped at 100%.
      const fillRate = Math.min(1, acc.booked / acc.capacity);
      const occurrencesPerMonth = 30 / 7;
      const potentialPerMonth = Math.round(4 * fillRate * occurrencesPerMonth);
      return {
        weekday,
        percent,
        waitlist: Math.round((wlByWeekday.get(weekday) ?? 0) / Math.max(1, weeksAnalysed / 4)),
        capacity: acc.capacity,
        potentialPerMonth,
      };
    },
  );

  // Pressure = how full it is, with waitlist demand as the tie-breaker.
  suggestions.sort(
    (a, b) => b.percent - a.percent || b.waitlist - a.waitlist,
  );

  const totalCapacity = loads.reduce((s, d) => s + d.capacity, 0);
  const totalBooked = loads.reduce((s, d) => s + d.booked, 0);

  return {
    suggestions,
    daysAnalysed: daysBack,
    overallPercent:
      totalCapacity === 0 ? 0 : Math.round((totalBooked / totalCapacity) * 100),
  };
}
