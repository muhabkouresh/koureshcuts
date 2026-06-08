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
} as const;

export type AppointmentStatus =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

// Statuses that occupy a time slot (and therefore block double-booking).
export const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
];

// Granularity of bookable start times, in minutes (half-hour steps).
export const SLOT_INTERVAL_MINUTES = 30;
