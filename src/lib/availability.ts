import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { ACTIVE_STATUSES, SLOT_INTERVAL_MINUTES } from "./constants";
import { isValidDateStr, weekdayOf, zonedToUtc } from "./time";

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

const tz = siteConfig.timezone;

/** Inclusive overlap test between two [start,end) intervals. */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Compute bookable start slots for a service on a given calendar date.
 * Honors weekly business hours, full-day time-off, existing bookings (single
 * chair: no overlaps), minimum lead time and the booking window.
 */
export async function getAvailability(
  serviceId: string,
  dateStr: string,
): Promise<AvailabilityResult> {
  if (!isValidDateStr(dateStr)) {
    throw new Error("INVALID_DATE");
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) {
    throw new Error("INVALID_SERVICE");
  }

  const duration = service.durationMinutes;
  const empty: AvailabilityResult = {
    date: dateStr,
    serviceId,
    durationMinutes: duration,
    slots: [],
  };

  // Booking window: today .. today + bookingWindowDays (in shop tz).
  const now = new Date();
  const minStart = new Date(now.getTime() + siteConfig.minLeadMinutes * 60_000);
  const windowEnd = new Date(
    now.getTime() + siteConfig.bookingWindowDays * 24 * 60 * 60_000,
  );

  // Weekly hours for this weekday.
  const hours = await prisma.businessHours.findUnique({
    where: { dayOfWeek: weekdayOf(dateStr) },
  });
  if (!hours || hours.isClosed || hours.closeMinute <= hours.openMinute) {
    return empty;
  }

  // Full-day time-off covering this date blocks everything.
  const dayStartUtc = zonedToUtc(dateStr, 0, tz);
  const dayEndUtc = zonedToUtc(dateStr, 24 * 60, tz);
  const timeOff = await prisma.timeOff.findFirst({
    where: { startDate: { lt: dayEndUtc }, endDate: { gte: dayStartUtc } },
  });
  if (timeOff) {
    return empty;
  }

  // Existing active appointments that could overlap this day.
  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      startTime: { lt: dayEndUtc },
      endTime: { gt: dayStartUtc },
    },
    select: { startTime: true, endTime: true },
  });

  const slots: Slot[] = [];
  const lastStartMinute = hours.closeMinute - duration;
  for (
    let minute = hours.openMinute;
    minute <= lastStartMinute;
    minute += SLOT_INTERVAL_MINUTES
  ) {
    const start = zonedToUtc(dateStr, minute, tz);
    const end = new Date(start.getTime() + duration * 60_000);

    if (start < minStart) continue; // too soon / in the past
    if (start > windowEnd) continue; // beyond booking window

    const taken = appointments.some((a) =>
      overlaps(start, end, a.startTime, a.endTime),
    );
    if (taken) continue;

    slots.push({ start: start.toISOString(), end: end.toISOString() });
  }

  return { date: dateStr, serviceId, durationMinutes: duration, slots };
}
