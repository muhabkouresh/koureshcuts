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
