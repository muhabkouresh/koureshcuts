import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { myAppointmentsRequestSchema } from "@/lib/validation";
import { sendMyAppointmentsEmail } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// POST /api/my-appointments — email a magic link listing the customer's
// appointments. Responds identically whether or not the email is known, so
// the endpoint can't be used to probe which addresses have bookings.
export async function POST(request: NextRequest) {
  const limit = rateLimit(`myappts:${clientIp(request)}`, 3, 10 * 60_000);
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
  const email = parsed.data.email;

  const exists = await prisma.appointment.findFirst({
    where: { customerEmail: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    try {
      await sendMyAppointmentsEmail(email);
    } catch (err) {
      console.error("my-appointments email failed", err);
    }
  }

  // Same answer either way (no address probing).
  return Response.json({ ok: true });
}
