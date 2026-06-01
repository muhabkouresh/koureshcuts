import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [appointments, hoursRows, timeOff] = await Promise.all([
    prisma.appointment.findMany({
      where: { startTime: { gte: startOfToday } },
      orderBy: { startTime: "asc" },
      include: { service: { select: { name: true } } },
      take: 200,
    }),
    prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.timeOff.findMany({
      where: { endDate: { gte: new Date() } },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const dashboardData = {
    appointments: appointments.map((a) => ({
      id: a.id,
      serviceName: a.service.name,
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

  return <AdminDashboard data={dashboardData} />;
}
