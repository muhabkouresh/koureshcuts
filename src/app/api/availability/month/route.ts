import type { NextRequest } from "next/server";
import { getMonthAvailability } from "@/lib/availability";

// This route answers only WHICH DAYS of a month have at least one free slot —
// not the times. That is far less volatile than the per-day slot list (which
// stays no-store), identical for every visitor, and it is the request the
// calendar waits on. A short shared cache therefore makes the calendar appear
// almost instantly for everyone after the first visitor of that half-minute.
// Worst case: a day that just filled up still looks open for a few seconds —
// tapping it then shows the day view (uncached) with the waitlist.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// GET /api/availability/month?serviceId=...&year=2026&month=4
// month is 0-based (0 = January). Returns day-numbers with at least one slot.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId");
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (
    !serviceId ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 0 ||
    month > 11
  ) {
    return Response.json(
      { error: "serviceId, year and month (0-11) are required." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await getMonthAvailability(serviceId, year, month);
    return Response.json(result, { headers: CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "INVALID_SERVICE") {
      return Response.json({ error: message }, { status: 400, headers: NO_STORE });
    }
    console.error("month availability error", err);
    return Response.json(
      { error: "SERVER_ERROR" },
      { status: 500, headers: NO_STORE },
    );
  }
}
