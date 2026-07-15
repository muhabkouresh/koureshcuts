import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyEmailToken } from "@/lib/token";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import type { NextRequest } from "next/server";

const bodySchema = z.object({
  e: z.string().min(1),
  t: z.string().min(1),
});

// POST /api/news/abmelden — unsubscribe from broadcast emails. Authorized by
// the personal HMAC link from the email (base64url email + emailToken), same
// scheme as "Meine Termine". Deliberately a POST behind a confirm button so
// mail scanners that prefetch links can't unsubscribe anyone by accident.
export async function POST(request: NextRequest) {
  const limit = rateLimit(`unsub:${clientIp(request)}`, 10, 10 * 60_000);
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültiger Link." }, { status: 400 });
  }

  let email: string;
  try {
    email = Buffer.from(parsed.data.e, "base64url").toString("utf8");
  } catch {
    return Response.json({ error: "Ungültiger Link." }, { status: 400 });
  }
  if (!verifyEmailToken(email, parsed.data.t)) {
    return Response.json({ error: "Ungültiger Link." }, { status: 403 });
  }

  const key = email.trim().toLowerCase();
  await prisma.emailOptOut.upsert({
    where: { email: key },
    update: {},
    create: { email: key },
  });

  return Response.json({ ok: true });
}
