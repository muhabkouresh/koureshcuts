import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendBroadcastEmails } from "@/lib/email";

// Sending to a few hundred addresses in batches can take a moment.
export const maxDuration = 60;

const bodySchema = z.object({
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(5000),
});

/**
 * Every distinct customer email (from all appointments, any status — they all
 * booked at some point) minus everyone who unsubscribed from broadcasts.
 */
async function collectRecipients(): Promise<string[]> {
  const [rows, optOuts] = await Promise.all([
    prisma.appointment.findMany({
      where: { customerEmail: { not: "" } },
      distinct: ["customerEmail"],
      select: { customerEmail: true },
    }),
    prisma.emailOptOut.findMany({ select: { email: true } }),
  ]);
  const excluded = new Set(optOuts.map((o) => o.email));
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const r of rows) {
    const email = r.customerEmail.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }
  return recipients;
}

// GET /api/admin/broadcast — recipient count for the compose card.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const [recipients, optedOut] = await Promise.all([
    collectRecipients(),
    prisma.emailOptOut.count(),
  ]);
  return Response.json({ recipients: recipients.length, optedOut });
}

// POST /api/admin/broadcast — send a news email to every customer.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Bitte Betreff und Nachricht ausfüllen." },
      { status: 400 },
    );
  }

  const recipients = await collectRecipients();
  if (recipients.length === 0) {
    return Response.json({ error: "Keine Empfänger gefunden." }, { status: 400 });
  }

  const { sent, failed } = await sendBroadcastEmails(
    recipients,
    parsed.data.subject,
    parsed.data.message,
  );
  return Response.json({ ok: true, sent, failed, total: recipients.length });
}
