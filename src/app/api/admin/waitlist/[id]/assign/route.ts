import { Prisma } from "@prisma/client";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { BUSY_STATUSES, AppointmentStatus } from "@/lib/constants";
import { sendConfirmationEmails } from "@/lib/email";
import { sendAdminPush } from "@/lib/push";
import { formatDateTimeLabel } from "@/lib/time";
import { z } from "zod";

const schema = z.object({
  start: z.string().datetime({ message: "Ungültige Startzeit." }),
});

// POST /api/admin/waitlist/[id]/assign — the owner assigns a waitlist entry a
// concrete appointment (e.g. an extra slot appended after the existing ones).
// Like manual admin booking, this is NOT restricted to public opening hours —
// only clashes with existing appointments block it. The customer gets the
// normal confirmation email and the entry leaves the waitlist.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/admin/waitlist/[id]/assign">,
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }

  const entry = await prisma.waitlistEntry.findUnique({
    where: { id },
    include: { service: true },
  });
  if (!entry) {
    return Response.json({ error: "Eintrag nicht gefunden." }, { status: 404 });
  }
  if (!entry.service.active) {
    return Response.json(
      { error: "Der Service dieses Eintrags ist nicht mehr aktiv." },
      { status: 400 },
    );
  }

  const start = new Date(parsed.data.start);
  if (start <= new Date()) {
    return Response.json(
      { error: "Die Zeit liegt in der Vergangenheit." },
      { status: 400 },
    );
  }
  const end = new Date(
    start.getTime() + entry.service.durationMinutes * 60_000,
  );

  let appointmentId: string;
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const clash = await tx.appointment.findFirst({
          where: {
            status: { in: BUSY_STATUSES },
            startTime: { lt: end },
            endTime: { gt: start },
          },
          select: { id: true },
        });
        if (clash) {
          throw new Error("SLOT_TAKEN");
        }
        await tx.waitlistEntry.delete({ where: { id } });
        return tx.appointment.create({
          data: {
            serviceId: entry.serviceId,
            customerName: entry.customerName,
            customerEmail: entry.customerEmail,
            customerPhone: "",
            notes: "Von der Warteliste zugeteilt.",
            startTime: start,
            endTime: end,
            status: AppointmentStatus.CONFIRMED,
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    appointmentId = created.id;
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return Response.json(
        { error: "Diese Zeit überschneidet sich mit einem bestehenden Termin." },
        { status: 409 },
      );
    }
    console.error("waitlist assign error", err);
    return Response.json(
      { error: "Zuteilung fehlgeschlagen. Bitte erneut versuchen." },
      { status: 500 },
    );
  }

  // The customer gets the standard confirmation (with calendar + manage links).
  if (entry.customerEmail) {
    try {
      await sendConfirmationEmails({
        id: appointmentId,
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        serviceName: entry.service.name,
        priceCents: entry.service.priceCents,
        start,
        end,
      });
    } catch (err) {
      console.error("assign confirmation email failed", err);
    }
  }
  try {
    await sendAdminPush(
      "Warteliste: Termin zugeteilt",
      `${entry.customerName} — ${entry.service.name}, ${formatDateTimeLabel(start, siteConfig.timezone)}`,
    );
  } catch (err) {
    console.error("assign push failed", err);
  }

  return Response.json({ ok: true, id: appointmentId });
}
