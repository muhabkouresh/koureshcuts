import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { timeOffSchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/time";

// POST /api/admin/timeoff — block a date range (vacation / day off).
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = timeOffSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid dates." }, { status: 400 });
  }
  const { startDate, endDate, reason } = parsed.data;
  if (endDate < startDate) {
    return Response.json(
      { error: "End date must be on or after start date." },
      { status: 400 },
    );
  }

  // Store as [start-of-startDate, end-of-endDate) in the shop timezone so the
  // whole range of calendar days is blocked.
  const start = zonedToUtc(startDate, 0, siteConfig.timezone);
  const end = zonedToUtc(endDate, 24 * 60, siteConfig.timezone);

  const created = await prisma.timeOff.create({
    data: { startDate: start, endDate: end, reason: reason ?? "" },
  });
  return Response.json({ ok: true, id: created.id }, { status: 201 });
}
