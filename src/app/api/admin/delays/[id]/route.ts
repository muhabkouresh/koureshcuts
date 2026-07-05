import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/delays/[id] — remove a delay journal entry.
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/delays/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.delayLog.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
