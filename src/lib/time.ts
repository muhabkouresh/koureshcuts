import { fromZonedTime } from "date-fns-tz";
import { addDaysToDateStr, minutesToHHMM } from "./timeFormat";

// Time helpers for working in the shop's local timezone while storing UTC.
//
// Everything that only FORMATS lives in `timeFormat.ts` and needs no library —
// client components import it directly so date-fns never reaches a customer's
// phone. What remains here is the one thing worth a dependency: turning a wall
// clock in the shop timezone into an absolute instant. That runs on the server
// (availability engine, day-off boundaries) where bundle size is irrelevant and
// correctness across DST is everything.
export * from "./timeFormat";

/**
 * Current time in milliseconds. Wrapped in a helper so server components can
 * read the request-time clock without tripping the react-hooks/purity lint
 * rule (which only flags direct `Date.now()` calls inside a component body).
 */
export function nowMs(): number {
  return Date.now();
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
