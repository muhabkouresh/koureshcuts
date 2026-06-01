import type { NextRequest } from "next/server";
import { getAvailability } from "@/lib/availability";

// GET /api/availability?serviceId=...&date=YYYY-MM-DD — open slots for a day.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date");

  if (!serviceId || !date) {
    return Response.json(
      { error: "serviceId and date are required." },
      { status: 400 },
    );
  }

  try {
    const result = await getAvailability(serviceId, date);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "INVALID_DATE" || message === "INVALID_SERVICE") {
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("availability error", err);
    return Response.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
