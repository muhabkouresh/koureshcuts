import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vapidPublicKey, pushConfigured } from "@/lib/push";
import { z } from "zod";

// Web-Push subscription management for the admin PWA.

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
});

// GET /api/admin/push — VAPID public key + whether this device is subscribed
// is checked client-side; the server only reports configuration state.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return Response.json({ enabled: pushConfigured, publicKey: vapidPublicKey });
}

// POST /api/admin/push — register this device's push subscription.
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!pushConfigured) {
    return Response.json(
      { error: "Push ist auf dem Server nicht konfiguriert." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Subscription." }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  return Response.json({ ok: true }, { status: 201 });
}

// DELETE /api/admin/push — unregister this device.
export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const endpoint =
    typeof (body as { endpoint?: unknown }).endpoint === "string"
      ? ((body as { endpoint: string }).endpoint)
      : "";
  if (!endpoint) {
    return Response.json({ error: "endpoint erforderlich." }, { status: 400 });
  }
  await prisma.pushSubscription
    .delete({ where: { endpoint } })
    .catch(() => {});
  return Response.json({ ok: true });
}
