import { z } from "zod";
import { Prisma } from "@prisma/client";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { BUSY_STATUSES, AppointmentStatus } from "@/lib/constants";
import { sendShopRescheduleEmail } from "@/lib/email";
import { notifyWaitlistForDay } from "@/lib/waitlist";
import { dateKey } from "@/lib/time";

const bodySchema = z.object({
  start: z.string().datetime(),
  notify: z.boolean().optional().default(true),
  reason: z.string().trim().max(300).optional(),
});

// POST /api/admin/appointments/[id]/reschedule — the owner moves an active,
// upcoming appointment to a new time. Like waitlist assignment this works
// outside opening hours by design; only clashes with existing appointments
// are blocked. Optionally notifies the customer (old → new time) by email.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/admin/appointments/[id]/reschedule">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true },
  });
  if (!appt) {
    return Response.json({ error: "Termin nicht gefunden." }, { status: 404 });
  }
  const active =
    appt.status === AppointmentStatus.PENDING ||
    appt.status === AppointmentStatus.CONFIRMED;
  if (!active) {
    return Response.json(
      { error: "Nur aktive Termine können verschoben werden." },
      { status: 409 },
    );
  }

  const start = new Date(parsed.data.start);
  const end = new Date(start.getTime() + appt.service.durationMinutes * 60_000);
  if (start.getTime() <= Date.now()) {
    return Response.json(
      { error: "Die neue Zeit liegt in der Vergangenheit." },
      { status: 400 },
    );
  }
  if (start.getTime() === appt.startTime.getTime()) {
    return Response.json(
      { error: "Das ist bereits die aktuelle Terminzeit." },
      { status: 400 },
    );
  }

  const oldStart = appt.startTime;
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const clash = await tx.appointment.findFirst({
              where: {
                id: { not: id },
                status: { in: BUSY_STATUSES },
                startTime: { lt: end },
                endTime: { gt: start },
              },
              select: { id: true },
            });
            if (clash) {
              throw new Error("SLOT_TAKEN");
            }
            await tx.appointment.update({
              where: { id },
              data: {
                startTime: start,
                endTime: end,
                // The reminder refers to the old time — allow a fresh one.
                reminderSentAt: null,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (err) {
        const retriable =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2034";
        if (retriable && attempt < 3) continue;
        throw err;
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return Response.json(
        {
          error:
            "Diese Zeit überschneidet sich mit einem bestehenden Termin.",
        },
        { status: 409 },
      );
    }
    console.error("admin reschedule error", err);
    return Response.json(
      { error: "Termin konnte nicht verschoben werden." },
      { status: 500 },
    );
  }

  // Notifications are best-effort — the move itself already succeeded.
  let notified = false;
  if (parsed.data.notify && appt.customerEmail) {
    try {
      await sendShopRescheduleEmail(
        {
          id: appt.id,
          customerName: appt.customerName,
          customerEmail: appt.customerEmail,
          serviceName: appt.service.name,
          priceCents: appt.service.priceCents,
          start,
          end,
        },
        oldStart,
        parsed.data.reason,
      );
      notified = true;
    } catch (err) {
      console.error("shop reschedule email failed", err);
    }
  }

  // The old day gained a free slot — tell anyone waiting for it.
  const tz = siteConfig.timezone;
  if (dateKey(oldStart, tz) !== dateKey(start, tz)) {
    try {
      await notifyWaitlistForDay(oldStart);
    } catch (err) {
      console.error("waitlist auto-notify failed", err);
    }
  }

  return Response.json({
    ok: true,
    notified,
    start: start.toISOString(),
    end: end.toISOString(),
  });
}
