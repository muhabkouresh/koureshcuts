import { getAdminSession } from "@/lib/auth";

// POST /api/admin/logout — clear the admin session.
export async function POST() {
  const session = await getAdminSession();
  session.destroy();
  return Response.json({ ok: true });
}
