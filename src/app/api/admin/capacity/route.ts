import { isAuthenticated } from "@/lib/auth";
import { analyseHours, getUpcomingLoad } from "@/lib/capacity";

// GET /api/admin/capacity — utilisation of the coming week plus the
// opening-hours recommendation shown in the Statistik tab.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  // analyseHours picks its own window (6 weeks) — passing one here would
  // silently override it.
  const [outlook, hours] = await Promise.all([
    getUpcomingLoad(7),
    analyseHours(),
  ]);
  return Response.json({ outlook, hours });
}
