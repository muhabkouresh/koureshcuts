import { prisma } from "@/lib/prisma";
import { getNextFreeSlot } from "@/lib/availability";

// GET /api/next-slot — the earliest bookable slot across active services, for
// the homepage hero teaser. Split out of the page's server render so the
// landing HTML paints immediately; the teaser fills in a moment later. CDN-
// cached briefly (it's a global, non-personal hint) to spare the DB.
export const dynamic = "force-dynamic";

const CACHE = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function GET() {
  try {
    const service = await prisma.service.findFirst({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (!service) {
      return Response.json({ start: null }, { headers: CACHE });
    }
    const slot = await getNextFreeSlot(service.id);
    return Response.json(
      { serviceId: service.id, start: slot?.start ?? null },
      { headers: CACHE },
    );
  } catch (err) {
    console.error("next-slot error", err);
    return Response.json({ start: null }, { headers: CACHE });
  }
}
