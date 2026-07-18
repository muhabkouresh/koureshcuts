import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { ACTIVE_STATUSES } from "@/lib/constants";
import { sendReminderEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { runWinback } from "@/lib/winback";
import { sendCustomerReminderPush } from "@/lib/push";
import { formatDateTimeLabel } from "@/lib/time";

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
  // Same hygiene for "Termin-Radar" push devices. Devices with a known email
  // stay 90 days regardless of their watched day — they double as reminder-
  // push targets; anonymous day-watchers go 7 days after their day passed.
  await prisma.customerPush.deleteMany({
    where: {
      OR: [
        { email: "", date: { lt: new Date(nowTs - 7 * 24 * 60 * 60_000) } },
        { createdAt: { lt: new Date(nowTs - 90 * 24 * 60 * 60_000) } },
      ],
    },
  });
  // Visitor stats keep a rolling ~13 months of history.
  await prisma.pageView.deleteMany({
    where: { createdAt: { lt: new Date(nowTs - 400 * 24 * 60 * 60_000) } },
  });

  const settings = await getSettings();

  // Win-back: one "we miss you" mail per lapsed customer (see lib/winback).
  let winbackSent = 0;
  try {
    winbackSent = await runWinback(settings.winbackWeeks);
  } catch (err) {
    console.error("winback run failed", err);
  }

  if (!settings.reminderEnabled) {
    return Response.json({
      ok: true,
      disabled: true,
      considered: 0,
      sent: 0,
      winbackSent,
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
      // Bonus reminder as push for radar devices tied to this email.
      await sendCustomerReminderPush(
        appt.customerEmail,
        `${appt.service.name} — ${formatDateTimeLabel(appt.startTime, siteConfig.timezone)}. Bis dann!`,
      );
    } catch (err) {
      console.error(`reminder failed for ${appt.id}`, err);
    }
  }

  return Response.json({
    ok: true,
    considered: due.length,
    sent,
    winbackSent,
    waitlistCleaned: cleanedDay.count + cleanedFlex.count,
  });
}
