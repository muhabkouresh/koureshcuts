import type { Service, BusinessHours, Appointment } from "@prisma/client";
import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { getSettings } from "./settings";
import { BUSY_STATUSES, SLOT_INTERVAL_MINUTES } from "./constants";
import {
  daysInMonth,
  isValidDateStr,
  toDateStr,
  todayInTz,
  weekdayOf,
  zonedToUtc,
} from "./time";

export type Slot = {
  /** Absolute start instant, ISO string (UTC). */
  start: string;
  /** Absolute end instant, ISO string (UTC). */
  end: string;
};

export type AvailabilityResult = {
  date: string;
  serviceId: string;
  durationMinutes: number;
  slots: Slot[];
};

type ApptWindow = Pick<Appointment, "startTime" | "endTime">;
type TimeOffWindow = { startDate: Date; endDate: Date };
type SpecialDayWindow = { date: Date; openMinute: number; closeMinute: number };

const tz = siteConfig.timezone;

/** Inclusive overlap test between two [start,end) intervals. */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Pure slot computation for one day using already-loaded data. Honors weekly
 * hours, full-day time-off, existing bookings (single chair), lead time and
 * the booking window.
 */
function computeSlots(
  dateStr: string,
  service: Pick<Service, "durationMinutes">,
  hoursByDay: Map<number, BusinessHours>,
  timeOffs: TimeOffWindow[],
  specialDays: SpecialDayWindow[],
  appointments: ApptWindow[],
  now: Date,
  windowDays: number,
): Slot[] {
  const duration = service.durationMinutes;
  const minStart = new Date(now.getTime() + siteConfig.minLeadMinutes * 60_000);
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60_000);

  const dayStartUtc = zonedToUtc(dateStr, 0, tz);
  const dayEndUtc = zonedToUtc(dateStr, 24 * 60, tz);

  // An extra working day (public) overrides the weekly template and opens the
  // date with its own hours, even if that weekday is normally closed.
  const special = specialDays.find(
    (s) => s.date >= dayStartUtc && s.date < dayEndUtc,
  );
  let openMinute: number;
  let closeMinute: number;
  if (special) {
    openMinute = special.openMinute;
    closeMinute = special.closeMinute;
  } else {
    const hours = hoursByDay.get(weekdayOf(dateStr));
    if (!hours || hours.isClosed || hours.closeMinute <= hours.openMinute) {
      return [];
    }
    openMinute = hours.openMinute;
    closeMinute = hours.closeMinute;
  }

  // Full-day time-off covering this date blocks everything (overrides extra days).
  const blocked = timeOffs.some(
    (t) => t.startDate < dayEndUtc && t.endDate >= dayStartUtc,
  );
  if (blocked) return [];

  const slots: Slot[] = [];
  const lastStartMinute = closeMinute - duration;
  for (
    let minute = openMinute;
    minute <= lastStartMinute;
    minute += SLOT_INTERVAL_MINUTES
  ) {
    const start = zonedToUtc(dateStr, minute, tz);
    const end = new Date(start.getTime() + duration * 60_000);
    if (start < minStart) continue;
    // Extra working days are bookable regardless of the normal booking window.
    if (!special && start > windowEnd) continue;
    if (appointments.some((a) => overlaps(start, end, a.startTime, a.endTime)))
      continue;
    slots.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return slots;
}

async function loadService(serviceId: string) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) throw new Error("INVALID_SERVICE");
  return service;
}

async function loadHoursMap(): Promise<Map<number, BusinessHours>> {
  const rows = await prisma.businessHours.findMany();
  return new Map(rows.map((h) => [h.dayOfWeek, h]));
}

/**
 * Open slots for one service on one calendar date. When rescheduling, pass
 * `excludeAppointmentId` so the customer's own booking doesn't block the day.
 */
export async function getAvailability(
  serviceId: string,
  dateStr: string,
  excludeAppointmentId?: string,
): Promise<AvailabilityResult> {
  if (!isValidDateStr(dateStr)) throw new Error("INVALID_DATE");
  const service = await loadService(serviceId);

  const dayStartUtc = zonedToUtc(dateStr, 0, tz);
  const dayEndUtc = zonedToUtc(dateStr, 24 * 60, tz);

  const [hoursByDay, timeOffs, specialDays, appointments, settings] =
    await Promise.all([
      loadHoursMap(),
      prisma.timeOff.findMany({
        where: { startDate: { lt: dayEndUtc }, endDate: { gte: dayStartUtc } },
        select: { startDate: true, endDate: true },
      }),
      prisma.specialDay.findMany({
        where: { isPublic: true, date: { gte: dayStartUtc, lt: dayEndUtc } },
        select: { date: true, openMinute: true, closeMinute: true },
      }),
      prisma.appointment.findMany({
        where: {
          status: { in: BUSY_STATUSES },
          startTime: { lt: dayEndUtc },
          endTime: { gt: dayStartUtc },
          ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        },
        select: { startTime: true, endTime: true },
      }),
      getSettings(),
    ]);

  const slots = computeSlots(
    dateStr,
    service,
    hoursByDay,
    timeOffs,
    specialDays,
    appointments,
    new Date(),
    settings.bookingWindowDays,
  );
  return {
    date: dateStr,
    serviceId,
    durationMinutes: service.durationMinutes,
    slots,
  };
}

/**
 * Earliest bookable slot for a service (across this and next month — the
 * booking window never reaches further than that plus change). Used for the
 * "next free appointment" teaser on the landing page.
 */
export async function getNextFreeSlot(
  serviceId: string,
): Promise<{ start: string } | null> {
  const today = todayInTz(tz);
  const [y, m] = today.split("-").map(Number);

  for (let i = 0; i < 2; i++) {
    let year = y;
    let month0 = m - 1 + i;
    if (month0 > 11) {
      month0 -= 12;
      year += 1;
    }
    const { days } = await getMonthAvailability(serviceId, year, month0);
    for (const day of days) {
      const dateStr = toDateStr(year, month0, day);
      if (dateStr < today) continue;
      const { slots } = await getAvailability(serviceId, dateStr);
      if (slots.length > 0) return { start: slots[0].start };
    }
  }
  return null;
}

/**
 * Which day-numbers in a given month have at least one open slot. Loads the
 * month's data once and computes each day in memory.
 */
export async function getMonthAvailability(
  serviceId: string,
  year: number,
  month0: number,
): Promise<{ year: number; month: number; days: number[]; full: number[] }> {
  const service = await loadService(serviceId);

  const monthStartUtc = zonedToUtc(toDateStr(year, month0, 1), 0, tz);
  const total = daysInMonth(year, month0);
  const monthEndUtc = zonedToUtc(toDateStr(year, month0, total), 24 * 60, tz);

  const [hoursByDay, timeOffs, specialDays, appointments, settings] =
    await Promise.all([
      loadHoursMap(),
      prisma.timeOff.findMany({
        where: {
          startDate: { lt: monthEndUtc },
          endDate: { gte: monthStartUtc },
        },
        select: { startDate: true, endDate: true },
      }),
      prisma.specialDay.findMany({
        where: {
          isPublic: true,
          date: { gte: monthStartUtc, lt: monthEndUtc },
        },
        select: { date: true, openMinute: true, closeMinute: true },
      }),
      prisma.appointment.findMany({
        where: {
          status: { in: BUSY_STATUSES },
          startTime: { lt: monthEndUtc },
          endTime: { gt: monthStartUtc },
        },
        select: { startTime: true, endTime: true },
      }),
      getSettings(),
    ]);

  const now = new Date();
  const days: number[] = [];
  // Days that are open and within the booking window but have no free slot left
  // (i.e. fully booked) — offered as waitlist days in the calendar.
  const full: number[] = [];
  for (let day = 1; day <= total; day++) {
    const dateStr = toDateStr(year, month0, day);
    const slots = computeSlots(
      dateStr,
      service,
      hoursByDay,
      timeOffs,
      specialDays,
      appointments,
      now,
      settings.bookingWindowDays,
    );
    if (slots.length > 0) {
      days.push(day);
      continue;
    }
    // No free slots — distinguish "open but fully booked" from "closed" by
    // recomputing as if there were no bookings. If that yields slots, the day
    // is genuinely open (and in-window) but full.
    const capacity = computeSlots(
      dateStr,
      service,
      hoursByDay,
      timeOffs,
      specialDays,
      [],
      now,
      settings.bookingWindowDays,
    );
    if (capacity.length > 0) full.push(day);
  }
  return { year, month: month0, days, full };
}
