import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { buildIcs } from "@/lib/calendar";

// GET /api/appointments/[id]/ics — download a calendar file for an appointment.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/appointments/[id]/ics">,
) {
  const { id } = await ctx.params;

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true },
  });
  if (!appt) {
    return new Response("Not found", { status: 404 });
  }

  let ics: string;
  try {
    ics = buildIcs({
      title: `${appt.service.name} — ${siteConfig.name}`,
      description: `Dein Termin (${appt.service.name}) bei ${siteConfig.name}. Zahlung vor Ort.`,
      location: siteConfig.address,
      start: appt.startTime,
      end: appt.endTime,
      // Stable per appointment: repeat taps or a post-reschedule download
      // update the existing calendar entry instead of duplicating it.
      uid: `${appt.id}@koureshcuts.de`,
    });
  } catch (err) {
    console.error("ics error", err);
    return new Response("Could not generate calendar file", { status: 500 });
  }

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // `inline` (not `attachment`) so Apple devices open the "Add to Calendar"
      // sheet directly instead of silently saving the file to Files. The
      // `download` attribute on the link forces a proper filename on desktop.
      "Content-Disposition": 'inline; filename="termin.ics"',
      // Never cache: appointments can be rescheduled or swapped, and a cached
      // copy would hand the customer the OLD time for up to an hour.
      "Cache-Control": "no-store",
    },
  });
}
