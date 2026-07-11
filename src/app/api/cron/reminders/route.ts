import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/lib/constants";
import { sendReminderEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";

// GET /api/cron/reminders — invoked daily by Vercel Cron. Sends a reminder
// email for every active appointment starting within the next 24 hours that
// hasn't already been reminded. Guarded by CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Waitlist hygiene: drop entries whose requested day is more than 7 days
  // past, and flexible entries older than 90 days — the list stays tidy
  // without the owner ever cleaning up manually.
  const nowTs = Date.now();
  const cleanedDay = await prisma.waitlistEntry.deleteMany({
    where: { date: { lt: new Date(nowTs - 7 * 24 * 60 * 60_000) } },
  });
  const cleanedFlex = await prisma.waitlistEntry.deleteMany({
    where: { date: null, createdAt: { lt: new Date(nowTs - 90 * 24 * 60 * 60_000) } },
  });

  const settings = await getSettings();
  if (!settings.reminderEnabled) {
    return Response.json({
      ok: true,
      disabled: true,
      considered: 0,
      sent: 0,
      waitlistCleaned: cleanedDay.count + cleanedFlex.count,
    });
  }

  const now = new Date();
  // The cron fires only once a day (Vercel Hobby), so a lead below 24 hours
  // would miss every appointment later in the day. Clamp defensively even if
  // an old value is still stored.
  const leadHours = Math.max(24, settings.reminderLeadHours);
  const windowEnd = new Date(now.getTime() + leadHours * 60 * 60_000);

  const due = await prisma.appointment.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      reminderSentAt: null,
      startTime: { gt: now, lte: windowEnd },
    },
    include: { service: true },
  });

  let sent = 0;
  for (const appt of due) {
    try {
      await sendReminderEmail({
        id: appt.id,
        customerName: appt.customerName,
        customerEmail: appt.customerEmail,
        serviceName: appt.service.name,
        priceCents: appt.service.priceCents,
        start: appt.startTime,
        end: appt.endTime,
      });
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error(`reminder failed for ${appt.id}`, err);
    }
  }

  return Response.json({
    ok: true,
    considered: due.length,
    sent,
    waitlistCleaned: cleanedDay.count + cleanedFlex.count,
  });
}
