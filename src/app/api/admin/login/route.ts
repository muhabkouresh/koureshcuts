import type { NextRequest } from "next/server";
import { checkPassword, getAdminSession } from "@/lib/auth";
import { adminLoginSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// POST /api/admin/login — exchange the admin password for a session cookie.
export async function POST(request: NextRequest) {
  // Throttle guessing: max 5 attempts per 15 minutes per IP.
  const limit = rateLimit(`login:${clientIp(request)}`, 5, 15 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Zu viele Versuche. Bitte warte einige Minuten." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Passwort erforderlich." }, { status: 400 });
  }

  if (!checkPassword(parsed.data.password)) {
    return Response.json({ error: "Falsches Passwort." }, { status: 401 });
  }

  const session = await getAdminSession();
  session.isAdmin = true;
  await session.save();
  return Response.json({ ok: true });
}
