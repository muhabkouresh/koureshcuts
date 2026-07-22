import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { ACTIVE_STATUSES } from "@/lib/constants";
import { buildIcsFeed, type CalendarEvent } from "@/lib/calendar";

// GET /api/admin/calendar?token=...
// A subscribable .ics feed of all upcoming bookings. Add it once in your
// calendar app (Google/Apple) and new bookings sync in automatically.
// Auth is via the ICS_FEED_TOKEN query param (calendar apps can't send cookies).
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  const expected = process.env.ICS_FEED_TOKEN;
  if (!expected || token !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  // From a week ago onward, so recent history stays visible in the calendar.
  const from = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const appts = await prisma.appointment.findMany({
    where: { status: { in: ACTIVE_STATUSES }, startTime: { gte: from } },
    orderBy: { startTime: "asc" },
    include: { service: true },
  });

  const events: CalendarEvent[] = appts.map((a) => ({
    title: `${a.customerName} — ${a.service.name}`,
    description:
      `Kunde: ${a.customerName}` +
      (a.customerPhone ? `\nTelefon: ${a.customerPhone}` : "") +
      (a.customerEmail ? `\nE-Mail: ${a.customerEmail}` : "") +
      (a.notes ? `\nNotiz: ${a.notes}` : ""),
    location: siteConfig.address,
    start: a.startTime,
    end: a.endTime,
    // Stable UID so a rescheduled booking moves in the subscribed calendar
    // instead of appearing twice.
    uid: `${a.id}@koureshcuts.de`,
  }));

  let feed: string;
  try {
    feed = buildIcsFeed(events);
  } catch (err) {
    console.error("ics feed error", err);
    return new Response("Could not build feed", { status: 500 });
  }

  return new Response(feed, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="kouresh-cuts.ics"',
      "Cache-Control": "no-cache",
    },
  });
}
