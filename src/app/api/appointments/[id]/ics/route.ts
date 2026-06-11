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
      // The file is immutable for a given appointment — cache it so repeat taps
      // never wait on a cold serverless start.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
