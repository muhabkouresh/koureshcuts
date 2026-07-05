import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockCustomerSchema } from "@/lib/validation";

// Manual booking blocklist (admin). Emails are stored lowercase; the booking
// API rejects any request whose email is on this list.

// GET /api/admin/blocklist — all blocked emails.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const blocked = await prisma.blockedCustomer.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ blocked });
}

// POST /api/admin/blocklist — block an email (idempotent).
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = blockCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }
  const email = parsed.data.email.toLowerCase();
  await prisma.blockedCustomer.upsert({
    where: { email },
    update: { reason: parsed.data.reason ?? "" },
    create: { email, reason: parsed.data.reason ?? "" },
  });
  return Response.json({ ok: true }, { status: 201 });
}

// DELETE /api/admin/blocklist — unblock an email.
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
  const email =
    typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  if (!email) {
    return Response.json({ error: "E-Mail erforderlich." }, { status: 400 });
  }
  await prisma.blockedCustomer.deleteMany({ where: { email } });
  return Response.json({ ok: true });
}
