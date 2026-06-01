import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appointmentActionSchema } from "@/lib/validation";

// PATCH /api/admin/appointments/[id] — update an appointment's status
// (e.g. CANCELLED, COMPLETED, CONFIRMED).
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/admin/appointments/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = appointmentActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }

  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.appointment.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  return Response.json({ ok: true });
}
