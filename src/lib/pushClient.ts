// Browser-side helpers for customer push notifications, shared by the opt-in
// button (PushOptIn) and the in-app banner (PushBanner). Everything here runs
// in the browser only — never import it from a server component.

/** Web-Push needs the VAPID key as a Uint8Array over a plain ArrayBuffer. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Running as an installed app (home-screen icon) rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Whether this browser can do Web-Push at all. iOS: only inside the app. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * True when this device already has notifications switched on, so the banner
 * and the opt-in button can stay out of the way.
 */
export async function pushAlreadyOn(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

export type EnablePushResult =
  | "ok"
  | "denied"
  | "blocked"
  | "unsupported"
  | "rate-limited"
  | "error";

/**
 * Ask for permission, subscribe, and register the device with the server.
 * `reminderOnly` devices get appointment reminders but no "slot freed" alerts.
 *
 * MUST be called straight from a click handler. Safari — and iOS especially —
 * only accepts Notification.requestPermission() while a user gesture is still
 * "live", and every awaited call before it voids that gesture. So permission
 * is requested first and the config fetch happens afterwards; doing it the
 * other way round made this fail on iPhones with a generic error.
 */
export async function enablePush(opts: {
  date?: string;
  email?: string;
  reminderOnly?: boolean;
} = {}): Promise<EnablePushResult> {
  if (!pushSupported()) return "unsupported";

  // Already turned down for good — asking again is a no-op in most browsers,
  // so tell the caller instead of showing a misleading failure.
  if (Notification.permission === "denied") return "blocked";

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (err) {
    console.error("push permission request failed", err);
    return "error";
  }
  if (permission !== "granted") return "denied";

  try {
    const conf = await fetch("/api/push").then((r) => r.json());
    if (!conf.enabled || !conf.publicKey) return "unsupported";

    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(conf.publicKey),
      }));

    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        date: opts.date,
        email: opts.email,
        reminderOnly: opts.reminderOnly ?? false,
      }),
    });
    if (res.status === 429) return "rate-limited";
    if (!res.ok) {
      console.error("push registration rejected", res.status);
      return "error";
    }
    return "ok";
  } catch (err) {
    console.error("push subscribe failed", err);
    return "error";
  }
}

/** German explanation for a failed attempt — shown directly to the customer. */
export function pushErrorText(result: EnablePushResult): string {
  switch (result) {
    case "denied":
      return "Du hast die Nachfrage abgelehnt. Tippe erneut, wenn du es dir anders überlegst.";
    case "blocked":
      return "Benachrichtigungen sind für diese Seite gesperrt. Du kannst sie in den Einstellungen deines Handys wieder erlauben.";
    case "unsupported":
      return "Dieses Gerät unterstützt keine Benachrichtigungen. Auf dem iPhone klappt es nur aus der installierten App heraus.";
    case "rate-limited":
      return "Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten.";
    default:
      return "Hat gerade nicht geklappt. Bitte versuche es später noch einmal.";
  }
}
