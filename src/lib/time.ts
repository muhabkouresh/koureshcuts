import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

// Time helpers for working in the shop's local timezone while storing UTC.

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Weekday (0 = Sunday … 6 = Saturday) for a "YYYY-MM-DD" calendar date. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Minutes-from-midnight -> "HH:MM" (24h). */
export function minutesToHHMM(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** Minutes-from-midnight -> "9:00 AM" (12h). */
export function minutesToTimeLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(m)} ${period}`;
}

/**
 * Convert a calendar date + minutes-from-midnight, interpreted in `tz`,
 * into the corresponding absolute UTC Date.
 */
export function zonedToUtc(dateStr: string, minutes: number, tz: string): Date {
  const local = `${dateStr}T${minutesToHHMM(minutes)}:00`;
  return fromZonedTime(local, tz);
}

/** Validate a "YYYY-MM-DD" string. */
export function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

/** Format an absolute instant as a time label in the shop timezone, e.g. "9:30 AM". */
export function formatTimeLabel(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "h:mm a");
}

/** Format an absolute instant as a full, human label in the shop timezone. */
export function formatDateTimeLabel(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "EEEE, MMMM d, yyyy 'at' h:mm a");
}

/** Format an absolute instant as a date label in the shop timezone, e.g. "Mon, Jun 1". */
export function formatDateLabel(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "EEE, MMM d, yyyy");
}

/** Today's calendar date ("YYYY-MM-DD") in the shop timezone. */
export function todayInTz(tz: string): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

/** Add `n` days to a "YYYY-MM-DD" string, returning a new "YYYY-MM-DD" string. */
export function addDaysToDateStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Short weekday + day label for a calendar date, e.g. "Mon 2". */
export function dayChipLabel(dateStr: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return {
    weekday: formatInTimeZone(d, "UTC", "EEE"),
    day: formatInTimeZone(d, "UTC", "d"),
    month: formatInTimeZone(d, "UTC", "MMM"),
  };
}
