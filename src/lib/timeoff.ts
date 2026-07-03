import { prisma } from "./prisma";
import { ACTIVE_STATUSES, AppointmentStatus } from "./constants";
import { sendShopCancellationEmail } from "./email";

// Helpers for creating/editing days off that may collide with existing
// bookings: find the affected appointments and (on request) cancel them with a
// customer notification.

export type ConflictInfo = {
  id: string;
  customerName: string;
  hasEmail: boolean;
  serviceName: string;
  start: string;
};

/** Upcoming active bookings that fall inside [start, end). */
export async function findConflictingAppointments(start: Date, end: Date) {
  return prisma.appointment.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      startTime: { lt: end, gte: new Date() },
      endTime: { gt: start },
    },
    orderBy: { startTime: "asc" },
    include: { service: true },
  });
}

export function toConflictInfo(
  appts: Awaited<ReturnType<typeof findConflictingAppointments>>,
): ConflictInfo[] {
  return appts.map((a) => ({
    id: a.id,
    customerName: a.customerName,
    hasEmail: Boolean(a.customerEmail),
    serviceName: a.service.name,
    start: a.startTime.toISOString(),
  }));
}

/**
 * Cancel the given bookings because the shop closed the day(s), and email
 * every customer that has an address. The waitlist is deliberately NOT
 * notified — the day is blocked, nothing became bookable.
 */
export async function cancelConflictingAppointments(
  appts: Awaited<ReturnType<typeof findConflictingAppointments>>,
  reason: string,
): Promise<{ cancelled: number; notified: number }> {
  let notified = 0;
  for (const appt of appts) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: {
        status: AppointmentStatus.CANCELLED,
        notes:
          (appt.notes ? `${appt.notes}\n` : "") +
          `Vom Shop abgesagt (geschlossen${reason ? `: ${reason}` : ""}).`,
      },
    });
    if (appt.customerEmail) {
      try {
        await sendShopCancellationEmail(
          {
            id: appt.id,
            customerName: appt.customerName,
            customerEmail: appt.customerEmail,
            serviceName: appt.service.name,
            priceCents: appt.service.priceCents,
            start: appt.startTime,
            end: appt.endTime,
          },
          reason || "Der Shop ist an diesem Tag geschlossen.",
        );
        notified += 1;
      } catch (err) {
        console.error(`shop cancellation email failed for ${appt.id}`, err);
      }
    }
  }
  return { cancelled: appts.length, notified };
}
