import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { BUSY_STATUSES, AppointmentStatus } from "@/lib/constants";
import { verifyOfferToken } from "@/lib/token";
import { sendConfirmationEmails } from "@/lib/email";
import { sendAdminPush } from "@/lib/push";
import { offerSlotToNext } from "@/lib/queue";
import { formatDateTimeLabel } from "@/lib/time";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { z } from "zod";

const actionSchema = z.object({ action: z.enum(["accept", "decline"]) });

// POST /api/waitlist/offer/[id]?t=<token> — accept or decline an exclusive
// slot offer. Accepting books the held slot; declining cascades it to the
// next person in the queue (the entry stays on the list).
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/waitlist/offer/[id]">,
) {
  const limit = rateLimit(`offer:${clientIp(request)}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t") ?? undefined;
  if (!verifyOfferToken(id, token)) {
    return Response.json({ error: "Ungültiger Link." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Aktion." }, { status: 400 });
  }

  const offer = await prisma.slotOffer.findUnique({
    where: { id },
    include: {
      entry: true,
    },
  });
  if (!offer) {
    return Response.json({ error: "Angebot nicht gefunden." }, { status: 404 });
  }
  // `entry` is null if the entry was removed while the offer was live.
  if (
    offer.status !== "PENDING" ||
    offer.expiresAt <= new Date() ||
    !offer.entry
  ) {
    return Response.json(
      {
        error:
          "Dieses Angebot ist leider abgelaufen oder nicht mehr gültig. Du bleibst auf der Warteliste.",
      },
      { status: 409 },
    );
  }
  const entry = offer.entry;

  const service = await prisma.service.findUnique({
    where: { id: offer.serviceId },
  });
  if (!service) {
    return Response.json({ error: "Service nicht gefunden." }, { status: 400 });
  }

  if (parsed.data.action === "decline") {
    await prisma.slotOffer.update({
      where: { id },
      data: { status: "DECLINED" },
    });
    // Straight to the next person — the slot shouldn't idle.
    try {
      await offerSlotToNext(offer.startTime);
    } catch (err) {
      console.error("offer cascade after decline failed", err);
    }
    return Response.json({ ok: true, declined: true });
  }

  // Accept: book the held slot for the entry's customer.
  let appointmentId: string;
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const clash = await tx.appointment.findFirst({
          where: {
            status: { in: BUSY_STATUSES },
            startTime: { lt: offer.endTime },
            endTime: { gt: offer.startTime },
          },
          select: { id: true },
        });
        if (clash) {
          throw new Error("SLOT_TAKEN");
        }
        await tx.slotOffer.update({
          where: { id },
          data: { status: "ACCEPTED" },
        });
        await tx.waitlistEntry.deleteMany({ where: { id: entry.id } });
        return tx.appointment.create({
          data: {
            serviceId: offer.serviceId,
            customerName: entry.customerName,
            customerEmail: entry.customerEmail,
            customerPhone: "",
            notes: "Über die Warteliste gebucht.",
            startTime: offer.startTime,
            endTime: offer.endTime,
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
        {
          error:
            "Dieser Termin wurde leider gerade anderweitig vergeben. Du bleibst auf der Warteliste.",
        },
        { status: 409 },
      );
    }
    console.error("offer accept error", err);
    return Response.json(
      { error: "Buchung fehlgeschlagen. Bitte erneut versuchen." },
      { status: 500 },
    );
  }

  try {
    await sendConfirmationEmails({
      id: appointmentId,
      customerName: entry.customerName,
      customerEmail: entry.customerEmail,
      serviceName: service.name,
      priceCents: service.priceCents,
      start: offer.startTime,
      end: offer.endTime,
    });
  } catch (err) {
    console.error("offer confirmation email failed", err);
  }
  try {
    await sendAdminPush(
      "Warteliste: Slot gebucht",
      `${entry.customerName} — ${service.name}, ${formatDateTimeLabel(offer.startTime, siteConfig.timezone)}`,
    );
  } catch (err) {
    console.error("offer push failed", err);
  }

  return Response.json({
    ok: true,
    id: appointmentId,
    serviceName: service.name,
    priceCents: service.priceCents,
    start: offer.startTime.toISOString(),
    end: offer.endTime.toISOString(),
  });
}
