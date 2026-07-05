import type { NextRequest } from "next/server";
import { myAppointmentsRequestSchema } from "@/lib/validation";
import { myAppointmentsUrl } from "@/lib/token";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// POST /api/my-appointments — direct access: entering an email immediately
// returns the signed "Meine Termine" URL (owner's decision: no confirmation
// link round trip). The IP rate limit keeps bulk probing expensive, and the
// list page shows nothing for addresses without bookings.
export async function POST(request: NextRequest) {
  const limit = rateLimit(`myappts:${clientIp(request)}`, 5, 10 * 60_000);
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
  const parsed = myAppointmentsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige E-Mail." },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, url: myAppointmentsUrl(parsed.data.email) });
}
