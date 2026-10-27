import { isAuthenticated } from "@/lib/auth";
import { getRevenueStats } from "@/lib/revenue";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" };

export async function GET() {
  if (!(await isAuthenticated())) return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  try {
    return Response.json(await getRevenueStats(), { headers });
  } catch (error) {
    console.error("admin revenue read failed", error);
    return Response.json({ error: "Daten konnten nicht aktualisiert werden." }, { status: 503, headers });
  }
}
