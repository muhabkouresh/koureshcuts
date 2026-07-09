import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWaitlistSpotEmail } from "@/lib/email";
import { releaseEntryOffers } from "@/lib/queue";

// POST /api/admin/waitlist/[id] — notify the customer that a spot opened up.
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/admin/waitlist/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id },
    include: { service: { select: { name: true } } },
  });
  if (!entry) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  let delivered = false;
  // Flexible entries get their offers automatically; the manual "spot free"
  // mail is only meant for day-specific entries.
  try {
    const res = await sendWaitlistSpotEmail({
      customerName: entry.customerName,
      customerEmail: entry.customerEmail,
      serviceName: entry.service.name,
      date: entry.date,
    });
    delivered = res.ok;
  } catch (err) {
    console.error("waitlist spot email failed", err);
  }

  if (!delivered) {
    return Response.json(
      {
        ok: false,
        error:
          "E-Mail konnte nicht zugestellt werden. Prüfe deine Resend-Domain (siehe Hinweis).",
      },
      { status: 502 },
    );
  }

  await prisma.waitlistEntry.update({
    where: { id },
    data: { notifiedAt: new Date() },
  });
  return Response.json({ ok: true });
}

// PATCH /api/admin/waitlist/[id] — set an entry's queue priority (bump to
// front). Higher priority wins; ties go to the earlier signup.
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/admin/waitlist/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const priority = (body as { priority?: unknown }).priority;
  if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 1000) {
    return Response.json({ error: "Ungültige Priorität." }, { status: 400 });
  }

  await prisma.waitlistEntry.update({ where: { id }, data: { priority } });
  return Response.json({ ok: true });
}

// DELETE /api/admin/waitlist/[id] — remove a waitlist entry.
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/waitlist/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  // Free any slot the entry is currently holding, then remove it.
  await releaseEntryOffers(id);
  await prisma.waitlistEntry.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
