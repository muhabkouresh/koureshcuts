import type { NextRequest } from "next/server";
import { getAvailability } from "@/lib/availability";

// Availability must always reflect the current DB (time-off, bookings, hours),
// so this route is never cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// GET /api/availability?serviceId=...&date=YYYY-MM-DD — open slots for a day.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date");

  if (!serviceId || !date) {
    return Response.json(
      { error: "serviceId and date are required." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await getAvailability(serviceId, date);
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "INVALID_DATE" || message === "INVALID_SERVICE") {
      return Response.json({ error: message }, { status: 400, headers: NO_STORE });
    }
    console.error("availability error", err);
    return Response.json(
      { error: "SERVER_ERROR" },
      { status: 500, headers: NO_STORE },
    );
  }
}
