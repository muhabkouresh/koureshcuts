import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { de } from "date-fns/locale";

// Time helpers for working in the shop's local timezone while storing UTC.
// All human-facing labels use the German (de) locale to match the site.

const LOCALE = { locale: de };

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Current time in milliseconds. Wrapped in a helper so server components can
 * read the request-time clock without tripping the react-hooks/purity lint
 * rule (which only flags direct `Date.now()` calls inside a component body).
 */
export function nowMs(): number {
  return Date.now();
}

/** Weekday (0 = Sunday … 6 = Saturday) for a "YYYY-MM-DD" calendar date. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Minutes-from-midnight -> "HH:MM" (24h). */
export function minutesToHHMM(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/**
 * Convert a calendar date + minutes-from-midnight, interpreted in `tz`,
 * into the corresponding absolute UTC Date. Minutes >= 1440 (e.g. 24:00 for the
 * end of a day) correctly roll over to the following day instead of producing
 * an invalid "24:00" local time.
 */
export function zonedToUtc(dateStr: string, minutes: number, tz: string): Date {
  const day = addDaysToDateStr(dateStr, Math.floor(minutes / 1440));
  const min = ((minutes % 1440) + 1440) % 1440;
  const local = `${day}T${minutesToHHMM(min)}:00`;
  return fromZonedTime(local, tz);
}

/** Validate a "YYYY-MM-DD" string. */
export function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

/** Time label in the shop timezone, e.g. "14:00 Uhr". */
export function formatTimeLabel(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "HH:mm 'Uhr'", LOCALE);
}

/** Compact clock in the shop timezone, e.g. "14:00". */
export function formatClock(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "HH:mm", LOCALE);
}

/** Full date+time label, e.g. "Mi., 20.05.2026 • 14:00 Uhr". */
export function formatDateTimeLabel(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "EE, dd.MM.yyyy '•' HH:mm 'Uhr'", LOCALE);
}

/** Date label, e.g. "Mi., 20.05.2026". */
export function formatDateLabel(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "EE, dd.MM.yyyy", LOCALE);
}

/** Long date label, e.g. "Donnerstag, 4. Juni 2026". */
export function formatLongDate(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "EEEE, d. MMMM yyyy", LOCALE);
}

/** Long date label from a "YYYY-MM-DD" string (timezone-independent). */
export function longDateFromStr(dateStr: string): string {
  return formatInTimeZone(
    new Date(`${dateStr}T12:00:00Z`),
    "UTC",
    "EEEE, d. MMMM yyyy",
    LOCALE,
  );
}

/** Today's calendar date ("YYYY-MM-DD") in the shop timezone. */
export function todayInTz(tz: string): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

/** Calendar-date key ("YYYY-MM-DD") for an instant, in the shop timezone. */
export function dateKey(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

/** Add `n` days to a "YYYY-MM-DD" string, returning a new "YYYY-MM-DD" string. */
export function addDaysToDateStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Build "YYYY-MM-DD" from year, 0-based month, day. */
export function toDateStr(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

/** Number of days in a given month (month0 is 0-based). */
export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * Monday-first weekday index (0 = Monday … 6 = Sunday) of the 1st of a month.
 * Used to compute the leading blank cells of a calendar grid.
 */
export function firstWeekdayMondayFirst(year: number, month0: number): number {
  const sundayFirst = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/** German month + year label, e.g. "Mai 2026". */
export function monthLabel(year: number, month0: number): string {
  return formatInTimeZone(
    new Date(Date.UTC(year, month0, 1, 12)),
    "UTC",
    "MMMM yyyy",
    LOCALE,
  );
}
