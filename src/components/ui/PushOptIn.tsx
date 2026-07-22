"use client";

import { useEffect, useState } from "react";

// Shared customer push opt-in, used in two places:
// - booking flow (waitlist "Termin-Radar" + post-booking reminder opt-in)
// - "Meine Termine" (existing customers enabling reminder pushes later)
//
// With `reminderOnly` the device receives ONLY reminder pushes for its booked
// appointments — never the "slot freed" radar messages (see /api/push).

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushOptIn({
  date,
  email,
  reminderOnly = false,
  title,
  label = "🔔 Zusätzlich Sofort-Push aufs Handy",
  activeText = "🔔 Termin-Radar aktiv — du bekommst sofort eine Push-Nachricht auf diesem Gerät, wenn etwas frei wird.",
  hint,
}: {
  date?: string;
  email?: string;
  reminderOnly?: boolean;
  /** Renders the opt-in inside its own highlighted box with this heading. */
  title?: string;
  label?: string;
  activeText?: string;
  /** Small print below the button (e.g. the iOS install requirement). */
  hint?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "on" | "error">("idle");

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only feature detection (browser APIs unavailable during SSR) */
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window,
    );
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!supported) return null;

  async function enable() {
    setState("busy");
    try {
      const conf = await fetch("/api/push").then((r) => r.json());
      if (!conf.enabled || !conf.publicKey) {
        setState("error");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("error");
        return;
      }
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
          date,
          email,
          reminderOnly,
        }),
      });
      setState(res.ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }

  const inner =
    state === "on" ? (
      <p className="mt-2 text-xs font-medium text-brand-700">{activeText}</p>
    ) : (
      <div className="mt-2">
        <button
          type="button"
          disabled={state === "busy"}
          onClick={enable}
          className="rounded-full bg-background px-4 py-2 text-xs font-semibold ring-1 ring-line transition-colors hover:ring-brand disabled:opacity-50"
        >
          {state === "busy" ? "…" : label}
        </button>
        {state === "error" && (
          <p className="mt-1.5 text-xs text-muted">
            Push konnte nicht aktiviert werden — die E-Mail-Benachrichtigung
            funktioniert trotzdem.
          </p>
        )}
        {hint && state !== "error" && (
          <p className="mt-1.5 text-[11px] text-muted">{hint}</p>
        )}
      </div>
    );

  if (!title) return inner;
  // Boxed variant: renders nothing at all when push is unsupported (early
  // return above), so no empty box appears.
  return (
    <div className="mt-6 rounded-xl bg-surface px-4 py-3 text-center">
      <p className="text-sm font-medium">{title}</p>
      {inner}
    </div>
  );
}
