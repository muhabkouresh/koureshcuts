import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWaitlistSpotEmail } from "@/lib/email";

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

// DELETE /api/admin/waitlist/[id] — remove a waitlist entry.
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/waitlist/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  await prisma.waitlistEntry.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
