import { z } from "zod";

// Request validation schemas (zod).

export const createAppointmentSchema = z.object({
  serviceId: z.string().min(1, "Service is required."),
  // Absolute start instant as ISO string; the server recomputes the end time.
  start: z.string().datetime({ message: "Invalid start time." }),
  customerName: z.string().trim().min(1, "Name is required.").max(120),
  customerEmail: z.string().trim().email("Enter a valid email."),
  customerPhone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number.")
    .max(30),
  notes: z.string().trim().max(500).optional().default(""),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Password is required."),
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

export const appointmentActionSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]),
});
