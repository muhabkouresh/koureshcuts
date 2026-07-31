// German date/time formatting in the shop timezone — built on the browser's
// own Intl API and plain arithmetic, with no date library.
//
// Why this file exists separately from `time.ts`: `time.ts` needs date-fns-tz
// for `zonedToUtc` (wall clock -> UTC, the availability engine's backbone), and
// importing anything from it pulled date-fns plus the whole German locale into
// every customer's browser — ~35 KB of JavaScript to print "Mi., 14.08.2026".
// Customer-facing components import this file instead; `time.ts` re-exports it
// so there is exactly one implementation and the server keeps its old imports.

const WEEKDAY_SHORT = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const WEEKDAY_LONG = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// Building an Intl.DateTimeFormat is expensive and the calendar formats dozens
// of slots per render, so keep one per timezone.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

type Parts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
};

/** Wall-clock fields of an instant, as read in `tz`. */
function partsIn(date: Date, tz: string): Parts {
  const raw = formatterFor(tz).formatToParts(date);
  const num = (type: string) => {
    const found = raw.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  const year = num("year");
  const month = num("month");
  const day = num("day");
  return {
    year,
    month,
    day,
    hour: num("hour"),
    minute: num("minute"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Weekday (0 = Sunday … 6 = Saturday) for a "YYYY-MM-DD" calendar date. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Minutes-from-midnight -> "HH:MM" (24h). */
export function minutesToHHMM(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** Validate a "YYYY-MM-DD" string. */
export function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

/** Time label in the shop timezone, e.g. "14:00 Uhr". */
export function formatTimeLabel(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${pad2(p.hour)}:${pad2(p.minute)} Uhr`;
}

/** Compact clock in the shop timezone, e.g. "14:00". */
export function formatClock(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Full date+time label, e.g. "Mi., 20.05.2026 • 14:00 Uhr". */
export function formatDateTimeLabel(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${WEEKDAY_SHORT[p.weekday]}, ${pad2(p.day)}.${pad2(p.month)}.${p.year} • ${pad2(p.hour)}:${pad2(p.minute)} Uhr`;
}

/** Date label, e.g. "Mi., 20.05.2026". */
export function formatDateLabel(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${WEEKDAY_SHORT[p.weekday]}, ${pad2(p.day)}.${pad2(p.month)}.${p.year}`;
}

/** Long date label, e.g. "Donnerstag, 4. Juni 2026". */
export function formatLongDate(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${WEEKDAY_LONG[p.weekday]}, ${p.day}. ${MONTHS[p.month - 1]} ${p.year}`;
}

/** Long date label from a "YYYY-MM-DD" string (timezone-independent). */
export function longDateFromStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY_LONG[weekday]}, ${d}. ${MONTHS[m - 1]} ${y}`;
}

/** Today's calendar date ("YYYY-MM-DD") in the shop timezone. */
export function todayInTz(tz: string): string {
  return dateKey(new Date(), tz);
}

/** Calendar-date key ("YYYY-MM-DD") for an instant, in the shop timezone. */
export function dateKey(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
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
  return `${MONTHS[month0]} ${year}`;
}
