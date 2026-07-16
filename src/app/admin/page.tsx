import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { getSettings } from "@/lib/settings";
import { getRevenueStats } from "@/lib/revenue";
import { nowMs } from "@/lib/time";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

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
    revenue,
    waitlist,
  ] = await Promise.all([
      prisma.appointment.findMany({
        where: { startTime: { gte: from, lte: to } },
        orderBy: { startTime: "asc" },
        include: { service: { select: { name: true, durationMinutes: true } } },
        take: 1000,
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
      getRevenueStats(),
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
    ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const feedToken = process.env.ICS_FEED_TOKEN || "";
  const feedUrl = feedToken
    ? `${siteUrl}/api/admin/calendar?token=${feedToken}`
    : "";

  const data = {
    feedUrl,
    bookingWindowDays: settings.bookingWindowDays,
    reminderEnabled: settings.reminderEnabled,
    reminderLeadHours: settings.reminderLeadHours,
    cancelDeadlineHours: settings.cancelDeadlineHours,
    maxActiveBookingsPerEmail: settings.maxActiveBookingsPerEmail,
    noShowBlockThreshold: settings.noShowBlockThreshold,
    winbackWeeks: settings.winbackWeeks,
    revenue,
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

  return <AdminDashboard data={data} siteName={siteConfig.name} />;
}
