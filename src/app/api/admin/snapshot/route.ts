import { isAuthenticated } from "@/lib/auth";
import { getAdminData } from "@/lib/adminData";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" };

export async function GET() {
  if (!(await isAuthenticated())) return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  try {
    return Response.json(await getAdminData(), { headers });
  } catch (error) {
    console.error("admin snapshot read failed", error);
    return Response.json({ error: "Daten konnten nicht aktualisiert werden." }, { status: 503, headers });
  }
}
