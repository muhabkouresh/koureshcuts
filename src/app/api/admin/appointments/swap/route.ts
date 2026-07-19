import { z } from "zod";
import { Prisma } from "@prisma/client";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BUSY_STATUSES, AppointmentStatus } from "@/lib/constants";
import { sendShopRescheduleEmail } from "@/lib/email";

const bodySchema = z.object({
  aId: z.string().min(1),
  bId: z.string().min(1),
  notify: z.boolean().optional().default(true),
});

// POST /api/admin/appointments/swap — exchange the times of two active,
// upcoming appointments in one step. Each keeps its own duration (end times
// are recomputed), so unequal services swap cleanly as long as nothing
// overlaps afterwards. Both customers get the "Termin verlegt" email.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || parsed.data.aId === parsed.data.bId) {
    return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }
  const { aId, bId, notify } = parsed.data;

  const [a, b] = await Promise.all([
    prisma.appointment.findUnique({ where: { id: aId }, include: { service: true } }),
    prisma.appointment.findUnique({ where: { id: bId }, include: { service: true } }),
  ]);
  if (!a || !b) {
    return Response.json({ error: "Termin nicht gefunden." }, { status: 404 });
  }
  const isActive = (s: string) =>
    s === AppointmentStatus.PENDING || s === AppointmentStatus.CONFIRMED;
  if (!isActive(a.status) || !isActive(b.status)) {
    return Response.json(
      { error: "Nur aktive Termine können getauscht werden." },
      { status: 409 },
    );
  }
  const now = Date.now();
  if (a.startTime.getTime() <= now || b.startTime.getTime() <= now) {
    return Response.json(
      { error: "Beide Termine müssen in der Zukunft liegen." },
      { status: 400 },
    );
  }

  // Each appointment keeps its own length (endTime − startTime also covers
  // manually stretched bookings, not just the service default).
  const aDur = a.endTime.getTime() - a.startTime.getTime();
  const bDur = b.endTime.getTime() - b.startTime.getTime();
  const aNewStart = b.startTime;
  const aNewEnd = new Date(aNewStart.getTime() + aDur);
  const bNewStart = a.startTime;
  const bNewEnd = new Date(bNewStart.getTime() + bDur);

  // Unequal durations can make the swapped pair collide with itself (e.g. a
  // 30-min slot directly before a 60-min one).
  if (aNewStart < bNewEnd && bNewStart < aNewEnd) {
    return Response.json(
      {
        error:
          "Die Termine sind unterschiedlich lang und würden sich nach dem Tausch überschneiden.",
      },
      { status: 409 },
    );
  }

  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const clash = await tx.appointment.findFirst({
              where: {
                id: { notIn: [aId, bId] },
                status: { in: BUSY_STATUSES },
                OR: [
                  { startTime: { lt: aNewEnd }, endTime: { gt: aNewStart } },
                  { startTime: { lt: bNewEnd }, endTime: { gt: bNewStart } },
                ],
              },
              select: { id: true },
            });
            if (clash) {
              throw new Error("SLOT_TAKEN");
            }
            await tx.appointment.update({
              where: { id: aId },
              data: {
                startTime: aNewStart,
                endTime: aNewEnd,
                // Reminders referred to the old times — allow fresh ones.
                reminderSentAt: null,
              },
            });
            await tx.appointment.update({
              where: { id: bId },
              data: { startTime: bNewStart, endTime: bNewEnd, reminderSentAt: null },
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
            "Eine der neuen Zeiten überschneidet sich mit einem anderen Termin.",
        },
        { status: 409 },
      );
    }
    console.error("admin swap error", err);
    return Response.json(
      { error: "Termine konnten nicht getauscht werden." },
      { status: 500 },
    );
  }

  // Notifications are best-effort — the swap itself already succeeded.
  let notified = 0;
  if (notify) {
    const mails: Array<{
      appt: typeof a;
      oldStart: Date;
      start: Date;
      end: Date;
    }> = [
      { appt: a, oldStart: a.startTime, start: aNewStart, end: aNewEnd },
      { appt: b, oldStart: b.startTime, start: bNewStart, end: bNewEnd },
    ];
    for (const m of mails) {
      if (!m.appt.customerEmail) continue;
      try {
        await sendShopRescheduleEmail(
          {
            id: m.appt.id,
            customerName: m.appt.customerName,
            customerEmail: m.appt.customerEmail,
            serviceName: m.appt.service.name,
            priceCents: m.appt.service.priceCents,
            start: m.start,
            end: m.end,
          },
          m.oldStart,
        );
        notified++;
      } catch (err) {
        console.error(`swap email failed for ${m.appt.id}`, err);
      }
    }
  }

  return Response.json({ ok: true, notified });
}
