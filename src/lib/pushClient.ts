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

export type EnablePushResult = "ok" | "denied" | "unsupported" | "error";

/**
 * Ask for permission, subscribe, and register the device with the server.
 * `reminderOnly` devices get appointment reminders but no "slot freed" alerts.
 */
export async function enablePush(opts: {
  date?: string;
  email?: string;
  reminderOnly?: boolean;
} = {}): Promise<EnablePushResult> {
  if (!pushSupported()) return "unsupported";
  try {
    const conf = await fetch("/api/push").then((r) => r.json());
    if (!conf.enabled || !conf.publicKey) return "unsupported";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

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
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
