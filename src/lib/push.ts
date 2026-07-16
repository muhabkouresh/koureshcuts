import webpush from "web-push";
import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";

// Web-Push notifications to the admin PWA (the owner's phone). Configured via
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; when unset, pushes are silently
// skipped so the booking flow never depends on them.

// Trim defensively — env values set via CLI pipes can carry stray newlines,
// and web-push rejects (throws on) anything that isn't clean URL-safe base64.
const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
let configured = false;

if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(
      `mailto:${siteConfig.ownerEmail || siteConfig.email}`,
      publicKey,
      privateKey,
    );
    configured = true;
  } catch (err) {
    console.error("invalid VAPID configuration — push disabled", err);
  }
}

export const vapidPublicKey = configured ? publicKey : "";
export const pushConfigured = configured;

/**
 * "Termin-Radar": push to customer devices watching a freed day. Day-specific
 * watchers get exactly one push (then notifiedAt blocks repeats); flexible
 * watchers (date null) at most one per 24 hours. Expired endpoints are
 * removed. Never throws.
 */
export async function sendCustomerPushForDay(
  dayStart: Date,
  dayEnd: Date,
  dayLabel: string,
): Promise<void> {
  if (!configured) return;
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
    const subs = await prisma.customerPush.findMany({
      where: {
        OR: [
          { date: { gte: dayStart, lt: dayEnd }, notifiedAt: null },
          { date: null, notifiedAt: null },
          { date: null, notifiedAt: { lt: cutoff } },
        ],
      },
    });
    const payload = JSON.stringify({
      title: "Termin frei geworden! ⚡",
      body: `Am ${dayLabel} ist gerade ein Termin frei geworden — wer zuerst bucht, bekommt ihn.`,
      url: "/",
    });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          await prisma.customerPush
            .update({ where: { id: s.id }, data: { notifiedAt: new Date() } })
            .catch(() => {});
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await prisma.customerPush
              .delete({ where: { id: s.id } })
              .catch(() => {});
          } else {
            console.error("customer push failed", err);
          }
        }
      }),
    );
  } catch (err) {
    console.error("customer push failed", err);
  }
}

/**
 * Reminder push to every radar device registered with this customer email
 * (set during waitlist push opt-in). Complements the reminder email. Never
 * throws; expired endpoints are removed.
 */
export async function sendCustomerReminderPush(
  email: string,
  body: string,
): Promise<void> {
  if (!configured || !email) return;
  try {
    const subs = await prisma.customerPush.findMany({
      where: { email: email.trim().toLowerCase() },
    });
    if (subs.length === 0) return;
    const payload = JSON.stringify({
      title: "Terminerinnerung 💈",
      body,
      url: "/meine-termine",
    });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await prisma.customerPush
              .delete({ where: { id: s.id } })
              .catch(() => {});
          } else {
            console.error("customer reminder push failed", err);
          }
        }
      }),
    );
  } catch (err) {
    console.error("customer reminder push failed", err);
  }
}

/** Send a notification to every registered admin device. Never throws. */
export async function sendAdminPush(title: string, body: string): Promise<void> {
  if (!configured) return;
  try {
    const subs = await prisma.pushSubscription.findMany();
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title, body }),
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410 = subscription expired or revoked — clean it up.
          if (status === 404 || status === 410) {
            await prisma.pushSubscription
              .delete({ where: { endpoint: s.endpoint } })
              .catch(() => {});
          } else {
            console.error("admin push failed", err);
          }
        }
      }),
    );
  } catch (err) {
    console.error("admin push failed", err);
  }
}
