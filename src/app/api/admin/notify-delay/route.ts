import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { ACTIVE_STATUSES } from "@/lib/constants";
import { delayNoticeSchema } from "@/lib/validation";
import { sendDelayEmail } from "@/lib/email";
import { todayInTz, zonedToUtc } from "@/lib/time";

// POST /api/admin/notify-delay — one-tap "running ~X minutes late" broadcast
// to every remaining active appointment today. Appointments stay unchanged.
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = delayNoticeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Minutenzahl." }, { status: 400 });
  }
  const { minutes } = parsed.data;

  const tz = siteConfig.timezone;
  const endOfToday = zonedToUtc(todayInTz(tz), 24 * 60, tz);
  const remaining = await prisma.appointment.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      startTime: { gte: new Date(), lt: endOfToday },
      customerEmail: { not: "" },
    },
    orderBy: { startTime: "asc" },
    include: { service: { select: { name: true } } },
  });

  let sent = 0;
  for (const appt of remaining) {
    try {
      const res = await sendDelayEmail(
        {
          customerName: appt.customerName,
          customerEmail: appt.customerEmail,
          serviceName: appt.service.name,
          start: appt.startTime,
        },
        minutes,
      );
      if (res.ok) sent += 1;
    } catch (err) {
      console.error(`delay email failed for ${appt.id}`, err);
    }
  }

  // Every broadcast lands in the delay journal (Verspätungen tab).
  try {
    await prisma.delayLog.create({
      data: {
        date: zonedToUtc(todayInTz(tz), 0, tz),
        minutes,
        note: "Kunden informiert",
        notified: sent,
      },
    });
  } catch (err) {
    console.error("delay log failed", err);
  }

  return Response.json({ ok: true, considered: remaining.length, sent });
}
