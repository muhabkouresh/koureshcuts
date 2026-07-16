import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockCustomerSchema } from "@/lib/validation";

// Approval list (admin): emails on this list can still book online, but the
// appointment is created PENDING and only becomes fix once the owner confirms
// it. A softer step than the full blocklist.

// GET /api/admin/reviewlist — all approval-required emails.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const review = await prisma.reviewCustomer.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ review });
}

// POST /api/admin/reviewlist — require approval for an email (idempotent).
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
  await prisma.reviewCustomer.upsert({
    where: { email },
    update: { reason: parsed.data.reason ?? "" },
    create: { email, reason: parsed.data.reason ?? "" },
  });
  return Response.json({ ok: true }, { status: 201 });
}

// DELETE /api/admin/reviewlist — remove an email from the approval list.
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
  await prisma.reviewCustomer.deleteMany({ where: { email } });
  return Response.json({ ok: true });
}
