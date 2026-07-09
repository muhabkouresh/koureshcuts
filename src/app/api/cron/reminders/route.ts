import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/lib/constants";
import { sendReminderEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { expireStaleOffers } from "@/lib/queue";

// GET /api/cron/reminders — invoked daily by Vercel Cron. Sends a reminder
// email for every active appointment starting within the next 24 hours that
// hasn't already been reminded. Guarded by CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Daily queue sweep: cascade any slot offers that expired without traffic.
  await expireStaleOffers();

  const settings = await getSettings();
  if (!settings.reminderEnabled) {
    return Response.json({ ok: true, disabled: true, considered: 0, sent: 0 });
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

  return Response.json({ ok: true, considered: due.length, sent });
}
