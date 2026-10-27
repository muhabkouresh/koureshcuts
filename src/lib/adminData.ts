import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { nowMs } from "./time";

// Private plan snapshot. Revenue/statistics are fetched only in their own tabs.
export async function getAdminData() {
  // Window for the calendar view: last ~31 days through ~92 days ahead.
  const from = new Date(nowMs() - 31 * 24 * 60 * 60_000);
  const to = new Date(nowMs() + 92 * 24 * 60 * 60_000);

  const [
    appointments,
    services,
    hoursRows,
    timeOff,
    specialDays,
    settings,
    waitlist,
    noShowGroups,
    cancelGroups,
    emailFailures,
  ] = await Promise.all([
      prisma.appointment.findMany({
        where: { startTime: { gte: from, lte: to } },
        orderBy: { startTime: "asc" },
        include: { service: { select: { name: true, durationMinutes: true } } },
      }),
      prisma.service.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, durationMinutes: true, priceCents: true },
      }),
      prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
      prisma.timeOff.findMany({
        where: { endDate: { gte: new Date() } },
        orderBy: { startDate: "asc" },
      }),
      prisma.specialDay.findMany({
        where: { date: { gte: new Date(nowMs() - 24 * 60 * 60_000) } },
        orderBy: { date: "asc" },
      }),
      getSettings(),
      prisma.waitlistEntry.findMany({
        where: {
          OR: [
            { date: null },
            { date: { gte: new Date(nowMs() - 24 * 60 * 60_000) } },
          ],
        },
        orderBy: { createdAt: "asc" },
        include: { service: { select: { name: true } } },
        take: 500,
      }),
      // No-show history per email — powers the risk badge on upcoming
      // appointments in the day plan.
      prisma.appointment.findMany({
        where: { status: "NO_SHOW", customerEmail: { not: "" } },
        select: { customerEmail: true },
      }),
      // Cancellation history per email — repeat cancellers cost slots that
      // often can't be refilled, so they get their own badge.
      prisma.appointment.findMany({
        where: { status: "CANCELLED", customerEmail: { not: "" } },
        select: { customerEmail: true },
      }),
      // Refused mails still waiting for a retry — powers the warning banner.
      prisma.emailFailure.count({
        where: { sentAt: null, attempts: { lt: 4 } },
      }),
    ]);

  // Sum per lowercased email — the same customer may appear in mixed case.
  const noShowByEmail = new Map<string, number>();
  for (const g of noShowGroups) {
    const key = g.customerEmail.toLowerCase();
    noShowByEmail.set(key, (noShowByEmail.get(key) ?? 0) + 1);
  }
  const cancelByEmail = new Map<string, number>();
  for (const g of cancelGroups) {
    const key = g.customerEmail.toLowerCase();
    cancelByEmail.set(key, (cancelByEmail.get(key) ?? 0) + 1);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const feedToken = process.env.ICS_FEED_TOKEN || "";
  const feedUrl = feedToken
    ? `${siteUrl}/api/admin/calendar?token=${feedToken}`
    : "";

  const data = {
    syncedAt: new Date().toISOString(),
    feedUrl,
    bookingWindowDays: settings.bookingWindowDays,
    reminderEnabled: settings.reminderEnabled,
    reminderLeadHours: settings.reminderLeadHours,
    cancelDeadlineHours: settings.cancelDeadlineHours,
    maxActiveBookingsPerEmail: settings.maxActiveBookingsPerEmail,
    noShowBlockThreshold: settings.noShowBlockThreshold,
    winbackWeeks: settings.winbackWeeks,
    ownerCopyEmails: settings.ownerCopyEmails,
    waitlistMaxPerDay: settings.waitlistMaxPerDay,
    emailFailures,
    services,
    appointments: appointments.map((a) => ({
      id: a.id,
      serviceName: a.service.name,
      durationMinutes: a.service.durationMinutes,
      customerName: a.customerName,
      customerEmail: a.customerEmail,
      customerPhone: a.customerPhone,
      notes: a.notes,
      status: a.status,
      start: a.startTime.toISOString(),
      end: a.endTime.toISOString(),
      riskNoShows: a.customerEmail
        ? (noShowByEmail.get(a.customerEmail.toLowerCase()) ?? 0)
        : 0,
      riskCancels: a.customerEmail
        ? (cancelByEmail.get(a.customerEmail.toLowerCase()) ?? 0)
        : 0,
    })),
    hours: hoursRows.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      isClosed: h.isClosed,
      openMinute: h.openMinute,
      closeMinute: h.closeMinute,
    })),
    timeOff: timeOff.map((t) => ({
      id: t.id,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      reason: t.reason,
    })),
    specialDays: specialDays.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      openMinute: s.openMinute,
      closeMinute: s.closeMinute,
      isPublic: s.isPublic,
      note: s.note,
    })),
    waitlist: waitlist.map((w) => ({
      id: w.id,
      serviceName: w.service.name,
      date: w.date ? w.date.toISOString() : null,
      weekdays: w.weekdays,
      createdAt: w.createdAt.toISOString(),
      customerName: w.customerName,
      customerEmail: w.customerEmail,
      notifiedAt: w.notifiedAt ? w.notifiedAt.toISOString() : null,
    })),
  };

  return data;
}

export type AdminData = Awaited<ReturnType<typeof getAdminData>>;
