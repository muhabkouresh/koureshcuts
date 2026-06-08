import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateServiceSchema } from "@/lib/validation";

// PATCH /api/admin/services/[id] — update fields (name, price, duration, active…).
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/admin/services/[id]">,
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

  const parsed = updateServiceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }

  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Service nicht gefunden." }, { status: 404 });
  }

  const service = await prisma.service.update({
    where: { id },
    data: parsed.data,
  });
  return Response.json({ service });
}

// DELETE /api/admin/services/[id] — remove a service. If it has appointments,
// it can't be hard-deleted (history would break), so we deactivate it instead.
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/services/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  const count = await prisma.appointment.count({ where: { serviceId: id } });
  if (count > 0) {
    await prisma.service.update({ where: { id }, data: { active: false } });
    return Response.json({ ok: true, deactivated: true });
  }

  await prisma.service.delete({ where: { id } });
  return Response.json({ ok: true, deactivated: false });
}
