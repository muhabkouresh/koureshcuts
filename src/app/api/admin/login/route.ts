import { checkPassword, getAdminSession } from "@/lib/auth";
import { adminLoginSchema } from "@/lib/validation";

// POST /api/admin/login — exchange the admin password for a session cookie.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Password is required." }, { status: 400 });
  }

  if (!checkPassword(parsed.data.password)) {
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  const session = await getAdminSession();
  session.isAdmin = true;
  await session.save();
  return Response.json({ ok: true });
}
