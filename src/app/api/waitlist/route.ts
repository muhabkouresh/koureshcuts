import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { joinWaitlistSchema } from "@/lib/validation";
import { sendWaitlistJoinedEmails } from "@/lib/email";
import { zonedToUtc } from "@/lib/time";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// POST /api/waitlist — join the waitlist: either for one fully-booked day
// (date set) or flexibly for the next free slot (optionally limited to
// preferred weekdays). Returns the queue position.
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

  // Start-of-day UTC for the requested day in the shop timezone; null = any.
  const date = input.date
    ? zonedToUtc(input.date, 0, siteConfig.timezone)
    : null;
  const weekdays = (input.weekdays ?? []).sort().join(",");

  // Avoid duplicate entries for the same person/service/day (or same person
  // twice on the flexible queue).
  const existing = await prisma.waitlistEntry.findFirst({
    where: {
      serviceId: service.id,
      date,
      customerEmail: { equals: input.customerEmail, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    const ahead = await prisma.waitlistEntry.count({
      where: { createdAt: { lt: new Date() }, id: { not: existing.id } },
    });
    return Response.json({ ok: true, already: true, position: ahead + 1 });
  }

  const created = await prisma.waitlistEntry.create({
    data: {
      serviceId: service.id,
      date,
      weekdays,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
    },
  });
  const position = await prisma.waitlistEntry.count({
    where: {
      OR: [
        { priority: { gt: 0 } },
        { priority: 0, createdAt: { lte: created.createdAt } },
      ],
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

  return Response.json({ ok: true, position }, { status: 201 });
}
