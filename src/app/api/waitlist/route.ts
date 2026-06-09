import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { joinWaitlistSchema } from "@/lib/validation";
import { sendWaitlistJoinedEmails } from "@/lib/email";
import { zonedToUtc } from "@/lib/time";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// POST /api/waitlist — add the customer to the waitlist for a fully-booked day.
export async function POST(request: NextRequest) {
  const limit = rateLimit(`waitlist:${clientIp(request)}`, 6, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = joinWaitlistSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
    return Response.json({ error: message }, { status: 400 });
  }
  const input = parsed.data;

  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
  });
  if (!service || !service.active) {
    return Response.json({ error: "Service nicht gefunden." }, { status: 400 });
  }

  // Start-of-day UTC for the requested day in the shop timezone.
  const date = zonedToUtc(input.date, 0, siteConfig.timezone);

  // Avoid duplicate entries for the same person/service/day.
  const existing = await prisma.waitlistEntry.findFirst({
    where: {
      serviceId: service.id,
      date,
      customerEmail: input.customerEmail,
    },
    select: { id: true },
  });
  if (existing) {
    return Response.json({ ok: true, already: true });
  }

  await prisma.waitlistEntry.create({
    data: {
      serviceId: service.id,
      date,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
    },
  });

  try {
    await sendWaitlistJoinedEmails({
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      serviceName: service.name,
      date,
    });
  } catch (err) {
    console.error("waitlist email failed", err);
  }

  return Response.json({ ok: true }, { status: 201 });
}
