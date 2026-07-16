import { z } from "zod";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { vapidPublicKey, pushConfigured } from "@/lib/push";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { zonedToUtc } from "@/lib/time";

// Public "Termin-Radar" endpoints: customers subscribe their device to get a
// push the moment a slot frees up (for one day, or any day).

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({
      p256dh: z.string().min(1).max(300),
      auth: z.string().min(1).max(300),
    }),
  }),
  // "YYYY-MM-DD" = watch this day only; omitted = any day.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // Enables reminder pushes for this customer's booked appointments.
  email: z.string().email().max(200).optional(),
});

// GET /api/push — VAPID public key for client-side subscription.
export async function GET() {
  return Response.json({ enabled: pushConfigured, publicKey: vapidPublicKey });
}

// POST /api/push — register (or re-point) a device.
export async function POST(request: NextRequest) {
  const limit = rateLimit(`push:${clientIp(request)}`, 10, 10 * 60_000);
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
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }

  const { subscription, date, email } = parsed.data;
  // Noon keeps the instant safely inside the day across DST changes.
  const dateInstant = date
    ? zonedToUtc(date, 12 * 60, siteConfig.timezone)
    : null;
  const emailKey = email?.trim().toLowerCase() ?? "";

  await prisma.customerPush.upsert({
    where: { endpoint: subscription.endpoint },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      date: dateInstant,
      email: emailKey,
      notifiedAt: null,
    },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      date: dateInstant,
      email: emailKey,
    },
  });

  return Response.json({ ok: true });
}

// DELETE /api/push — remove a device (customer switched the radar off).
export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = z.object({ endpoint: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }
  await prisma.customerPush
    .delete({ where: { endpoint: parsed.data.endpoint } })
    .catch(() => {});
  return Response.json({ ok: true });
}
