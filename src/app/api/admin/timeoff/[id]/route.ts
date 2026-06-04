import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { timeOffSchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/time";

// PUT /api/admin/timeoff/[id] — edit a blocked date range.
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/admin/timeoff/[id]">,
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

  const parsed = timeOffSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Daten." }, { status: 400 });
  }
  const { startDate, endDate, reason } = parsed.data;
  if (endDate < startDate) {
    return Response.json(
      { error: "Bis-Datum muss am/nach dem Von-Datum liegen." },
      { status: 400 },
    );
  }

  const existing = await prisma.timeOff.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  await prisma.timeOff.update({
    where: { id },
    data: {
      startDate: zonedToUtc(startDate, 0, siteConfig.timezone),
      endDate: zonedToUtc(endDate, 24 * 60, siteConfig.timezone),
      reason: reason ?? "",
    },
  });
  return Response.json({ ok: true });
}

// DELETE /api/admin/timeoff/[id] — remove a blocked date range.
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/timeoff/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  await prisma.timeOff.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
