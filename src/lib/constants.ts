// Appointment status values. Stored as plain strings in the DB (see schema note)
// so the model stays portable between SQLite and Postgres.
export const AppointmentStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  // Customer didn't show up. Set manually on a past appointment; excluded from
  // revenue and from "wahrgenommen" counts, tracked separately as a no-show.
  NO_SHOW: "NO_SHOW",
  // Admin-only manual block of a single time slot (break, errand, private).
  // Occupies the slot so it can't be booked, but is NOT a real booking — never
  // counts as revenue and never shows in the customer flow.
  BLOCKED: "BLOCKED",
} as const;

export type AppointmentStatus =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

// Real, active bookings (a customer holds the slot).
export const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
];

// Statuses that occupy a time slot and therefore block double-booking —
// active bookings PLUS admin manual blocks. Use this for every clash/
// availability check; use ACTIVE_STATUSES only where "a real booking" is meant.
export const BUSY_STATUSES: AppointmentStatus[] = [
  ...ACTIVE_STATUSES,
  AppointmentStatus.BLOCKED,
];

// Granularity of bookable start times, in minutes (half-hour steps).
export const SLOT_INTERVAL_MINUTES = 30;
