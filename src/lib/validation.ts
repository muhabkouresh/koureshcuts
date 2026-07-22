import { z } from "zod";

// Request validation schemas (zod).

export const createAppointmentSchema = z.object({
  serviceId: z.string().min(1, "Service is required."),
  // Absolute start instant as ISO string; the server recomputes the end time.
  start: z.string().datetime({ message: "Invalid start time." }),
  customerName: z.string().trim().min(1, "Name ist erforderlich.").max(120),
  customerEmail: z.string().trim().email("Gültige E-Mail eingeben."),
  // Optional — the public booking form doesn't collect a phone number.
  customerPhone: z.string().trim().max(30).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

// Customer-initiated reschedule (token-guarded, from the email link). Only the
// new start instant is needed — service and customer data stay unchanged.
export const rescheduleAppointmentSchema = z.object({
  start: z.string().datetime({ message: "Ungültige Startzeit." }),
});

// Joining the waitlist (public booking flow). With `date` = waiting for that
// specific fully-booked day; without = flexible ("next free slot"), optionally
// restricted to preferred weekdays (0=Sunday…6=Saturday).
export const joinWaitlistSchema = z.object({
  serviceId: z.string().min(1, "Service ist erforderlich."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.")
    .optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  customerName: z.string().trim().min(1, "Name ist erforderlich.").max(120),
  customerEmail: z.string().trim().email("Gültige E-Mail eingeben."),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Password is required."),
});

// Manually block/unblock a customer email from online booking (admin).
export const blockCustomerSchema = z.object({
  email: z.string().trim().email("Gültige E-Mail eingeben.").max(200),
  reason: z.string().trim().max(200).optional().default(""),
});

// One-tap "running late" broadcast to today's remaining customers (admin).
export const delayNoticeSchema = z.object({
  minutes: z.number().int().min(5).max(180),
});

// Emergency closure (Notfall-Knopf): close today (or today + tomorrow),
// cancel + email the affected customers in one step.
export const emergencyCloseSchema = z.object({
  days: z.number().int().min(1).max(2),
  reason: z.string().trim().max(200).optional().default(""),
});

// Delay minutes assigned to a customer (admin "Minutenkonto").
export const delayLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  minutes: z.number().int().min(1, "Mind. 1 Minute.").max(600),
  customerName: z.string().trim().min(1, "Kundenname ist erforderlich.").max(120),
  customerEmail: z.string().trim().max(200).optional().default(""),
  note: z.string().trim().max(200).optional().default(""),
});

// Manually logged product sale (admin Umsatz tab).
export const productSaleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  amountCents: z
    .number()
    .int()
    .min(1, "Betrag muss größer als 0 sein.")
    .max(1_000_000),
  note: z.string().trim().max(120).optional().default(""),
});

// Customer requests a magic link listing their appointments.
export const myAppointmentsRequestSchema = z.object({
  email: z.string().trim().email("Gültige E-Mail eingeben.").max(200),
});

// Admin manually scheduling an appointment. More permissive than the public
// form: email is optional (walk-ins), and time is not restricted to open slots.
export const adminCreateAppointmentSchema = z.object({
  serviceId: z.string().min(1, "Service ist erforderlich."),
  start: z.string().datetime({ message: "Ungültige Startzeit." }),
  customerName: z.string().trim().min(1, "Name ist erforderlich.").max(120),
  customerEmail: z.string().trim().max(200).optional().default(""),
  customerPhone: z.string().trim().max(30).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
  notify: z.boolean().optional().default(false),
});

export const businessHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isClosed: z.boolean(),
  openMinute: z.number().int().min(0).max(1440),
  closeMinute: z.number().int().min(0).max(1440),
});

export const updateHoursSchema = z.object({
  hours: z.array(businessHoursSchema).length(7),
});

export const timeOffSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date."),
  reason: z.string().trim().max(200).optional().default(""),
  // What to do when active bookings already exist in the range:
  // "abort" (default) rejects with the conflict list so the admin can decide,
  // "cancel" cancels them and emails the customers, "keep" leaves them as-is.
  onConflict: z.enum(["abort", "cancel", "keep"]).optional().default("abort"),
});

// Extra working day on a single date (with its own hours). `isPublic` decides
// whether customers may book it online or it is only an admin-side marker.
export const specialDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
    openMinute: z.number().int().min(0).max(1440),
    closeMinute: z.number().int().min(0).max(1440),
    isPublic: z.boolean().optional().default(true),
    note: z.string().trim().max(200).optional().default(""),
  })
  .refine((v) => v.closeMinute > v.openMinute, {
    message: "Schließzeit muss nach der Öffnungszeit liegen.",
  });

export const appointmentActionSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
  // When cancelling: send the customer an email about it (requires an email
  // on the booking), optionally with a short reason.
  notify: z.boolean().optional().default(false),
  reason: z.string().trim().max(300).optional().default(""),
});

// Service management (admin). Prices in integer cents, durations in minutes.
export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich.").max(80),
  description: z.string().trim().max(300).optional().default(""),
  durationMinutes: z.number().int().min(5, "Mind. 5 Min.").max(600),
  priceCents: z.number().int().min(0).max(1_000_000),
  active: z.boolean().optional().default(true),
});

export const updateServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).optional(),
    durationMinutes: z.number().int().min(5).max(600).optional(),
    priceCents: z.number().int().min(0).max(1_000_000).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Keine Änderungen übergeben.",
  });

export const settingsSchema = z
  .object({
    // How many days ahead customers may book (1–365).
    bookingWindowDays: z.number().int().min(1).max(365).optional(),
    // Whether reminder emails are sent.
    reminderEnabled: z.boolean().optional(),
    // Hours before the appointment the reminder is sent (24–168). The cron
    // job runs only once per day (Vercel Hobby), so anything below 24 hours
    // would silently skip most appointments — 24 is the enforced minimum.
    reminderLeadHours: z
      .number()
      .int()
      .min(24, "Mindestens 24 Stunden (Versand erfolgt einmal täglich).")
      .max(168)
      .optional(),
    // Until how many hours before the appointment customers may cancel or
    // reschedule online (0 = right up to the start time).
    cancelDeadlineHours: z.number().int().min(0).max(168).optional(),
    // Max simultaneous upcoming bookings per email (0 = unlimited).
    maxActiveBookingsPerEmail: z.number().int().min(0).max(10).optional(),
    // No-shows after which online booking is blocked (0 = never).
    noShowBlockThreshold: z.number().int().min(0).max(10).optional(),
    // Win-back email after N weeks without a visit (0 = off).
    winbackWeeks: z.number().int().min(0).max(52).optional(),
    // Owner-copy mails on bookings etc. (false = Mail-Sparmodus, push only).
    ownerCopyEmails: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Keine Änderungen übergeben.",
  });
