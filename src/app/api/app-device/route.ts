import { z } from "zod";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// POST /api/app-device — beacon that counts installed apps for the Statistik
// tab. The client only calls it when the site runs in standalone display mode
// (home-screen icon), so a plain browser visit never registers. `deviceId` is
// a random id the device stores itself; upserting on it means re-opening the
// app refreshes `lastSeenAt` instead of inflating the count. Nothing here
// identifies a person — no IP, no user agent, no email.

const bodySchema = z.object({
  // 32 hex chars, generated with crypto.randomUUID() on the device.
  deviceId: z.string().regex(/^[a-f0-9]{32}$/),
});

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = rateLimit(`appdev:${ip}`, 30, 10 * 60_000);
  if (!limit.ok) return new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 204 });

  const ua = request.headers.get("user-agent") ?? "";
  const platform = /iPhone|iPad|iPod/i.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : "desktop";

  try {
    await prisma.appDevice.upsert({
      where: { deviceId: parsed.data.deviceId },
      update: { lastSeenAt: new Date(), platform },
      create: { deviceId: parsed.data.deviceId, platform },
    });
  } catch (err) {
    console.error("app-device beacon failed", err);
  }
  return new Response(null, { status: 204 });
}
