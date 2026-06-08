import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { specialDaySchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/time";

// PUT /api/admin/special-days/[id] — edit an extra working day.
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/admin/special-days/[id]">,
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

  const parsed = specialDaySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten." },
      { status: 400 },
    );
  }

  const existing = await prisma.specialDay.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const { date, openMinute, closeMinute, isPublic, note } = parsed.data;
  await prisma.specialDay.update({
    where: { id },
    data: {
      date: zonedToUtc(date, 0, siteConfig.timezone),
      openMinute,
      closeMinute,
      isPublic,
      note: note ?? "",
    },
  });
  return Response.json({ ok: true });
}

// DELETE /api/admin/special-days/[id] — remove an extra working day.
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/special-days/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  await prisma.specialDay.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
