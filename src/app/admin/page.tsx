import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  // Window for the calendar view: last ~31 days through ~92 days ahead.
  const from = new Date(Date.now() - 31 * 24 * 60 * 60_000);
  const to = new Date(Date.now() + 92 * 24 * 60 * 60_000);

  const [appointments, services, hoursRows, timeOff] = await Promise.all([
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
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const feedToken = process.env.ICS_FEED_TOKEN || "";
  const feedUrl = feedToken
    ? `${siteUrl}/api/admin/calendar?token=${feedToken}`
    : "";

  const data = {
    feedUrl,
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
  };

  return <AdminDashboard data={data} siteName={siteConfig.name} />;
}
