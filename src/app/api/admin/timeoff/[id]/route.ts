import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
