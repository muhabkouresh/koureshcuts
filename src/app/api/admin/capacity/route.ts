import { isAuthenticated } from "@/lib/auth";
import { analyseHours, getUpcomingLoad } from "@/lib/capacity";

// GET /api/admin/capacity — utilisation of the coming week plus the
// opening-hours recommendation shown in the Statistik tab.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const [outlook, hours] = await Promise.all([
    getUpcomingLoad(7),
    analyseHours(60),
  ]);
  return Response.json({ outlook, hours });
}
