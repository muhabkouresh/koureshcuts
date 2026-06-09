import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { sendWaitlistSpotEmail } from "@/lib/email";
import { zonedToUtc } from "@/lib/time";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
});

// POST /api/admin/waitlist/notify-all — notify every (not-yet-notified) person
// on the waitlist for a given day at once. First to book gets the spot.
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültiges Datum." }, { status: 400 });
  }

  const dayStart = zonedToUtc(parsed.data.date, 0, siteConfig.timezone);
  const dayEnd = zonedToUtc(parsed.data.date, 24 * 60, siteConfig.timezone);

  const entries = await prisma.waitlistEntry.findMany({
    where: { date: { gte: dayStart, lt: dayEnd }, notifiedAt: null },
    include: { service: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  let sent = 0;
  let failed = 0;
  for (const entry of entries) {
    let ok = false;
    try {
      const res = await sendWaitlistSpotEmail({
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        serviceName: entry.service.name,
        date: entry.date,
      });
      ok = res.ok;
    } catch (err) {
      console.error("waitlist notify-all email failed", err);
    }
    if (ok) {
      sent += 1;
      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { notifiedAt: new Date() },
      });
    } else {
      failed += 1;
    }
  }

  return Response.json({ ok: true, sent, failed, total: entries.length });
}
