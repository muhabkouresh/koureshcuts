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

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Password is required."),
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
    // Hours before the appointment the reminder is sent (1–168 = up to a week).
    reminderLeadHours: z.number().int().min(1).max(168).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Keine Änderungen übergeben.",
  });
