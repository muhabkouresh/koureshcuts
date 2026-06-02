import type { Service, BusinessHours, Appointment } from "@prisma/client";
import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { getSettings } from "./settings";
import { ACTIVE_STATUSES, SLOT_INTERVAL_MINUTES } from "./constants";
import {
  daysInMonth,
  isValidDateStr,
  toDateStr,
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
  appointments: ApptWindow[],
  now: Date,
  windowDays: number,
): Slot[] {
  const duration = service.durationMinutes;
  const minStart = new Date(now.getTime() + siteConfig.minLeadMinutes * 60_000);
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60_000);

  const hours = hoursByDay.get(weekdayOf(dateStr));
  if (!hours || hours.isClosed || hours.closeMinute <= hours.openMinute) {
    return [];
  }

  const dayStartUtc = zonedToUtc(dateStr, 0, tz);
  const dayEndUtc = zonedToUtc(dateStr, 24 * 60, tz);

  // Full-day time-off covering this date blocks everything.
  const blocked = timeOffs.some(
    (t) => t.startDate < dayEndUtc && t.endDate >= dayStartUtc,
  );
  if (blocked) return [];

  const slots: Slot[] = [];
  const lastStartMinute = hours.closeMinute - duration;
  for (
    let minute = hours.openMinute;
    minute <= lastStartMinute;
    minute += SLOT_INTERVAL_MINUTES
  ) {
    const start = zonedToUtc(dateStr, minute, tz);
    const end = new Date(start.getTime() + duration * 60_000);
    if (start < minStart) continue;
    if (start > windowEnd) continue;
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

/** Open slots for one service on one calendar date. */
export async function getAvailability(
  serviceId: string,
  dateStr: string,
): Promise<AvailabilityResult> {
  if (!isValidDateStr(dateStr)) throw new Error("INVALID_DATE");
  const service = await loadService(serviceId);

  const dayStartUtc = zonedToUtc(dateStr, 0, tz);
  const dayEndUtc = zonedToUtc(dateStr, 24 * 60, tz);

  const [hoursByDay, timeOffs, appointments, settings] = await Promise.all([
    loadHoursMap(),
    prisma.timeOff.findMany({
      where: { startDate: { lt: dayEndUtc }, endDate: { gte: dayStartUtc } },
      select: { startDate: true, endDate: true },
    }),
    prisma.appointment.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        startTime: { lt: dayEndUtc },
        endTime: { gt: dayStartUtc },
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
 * Which day-numbers in a given month have at least one open slot. Loads the
 * month's data once and computes each day in memory.
 */
export async function getMonthAvailability(
  serviceId: string,
  year: number,
  month0: number,
): Promise<{ year: number; month: number; days: number[] }> {
  const service = await loadService(serviceId);

  const monthStartUtc = zonedToUtc(toDateStr(year, month0, 1), 0, tz);
  const total = daysInMonth(year, month0);
  const monthEndUtc = zonedToUtc(toDateStr(year, month0, total), 24 * 60, tz);

  const [hoursByDay, timeOffs, appointments, settings] = await Promise.all([
    loadHoursMap(),
    prisma.timeOff.findMany({
      where: { startDate: { lt: monthEndUtc }, endDate: { gte: monthStartUtc } },
      select: { startDate: true, endDate: true },
    }),
    prisma.appointment.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        startTime: { lt: monthEndUtc },
        endTime: { gt: monthStartUtc },
      },
      select: { startTime: true, endTime: true },
    }),
    getSettings(),
  ]);

  const now = new Date();
  const days: number[] = [];
  for (let day = 1; day <= total; day++) {
    const dateStr = toDateStr(year, month0, day);
    const slots = computeSlots(
      dateStr,
      service,
      hoursByDay,
      timeOffs,
      appointments,
      now,
      settings.bookingWindowDays,
    );
    if (slots.length > 0) days.push(day);
  }
  return { year, month: month0, days };
}
