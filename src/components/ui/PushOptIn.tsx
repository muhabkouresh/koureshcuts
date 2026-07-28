"use client";

import { useEffect, useState } from "react";
import {
  enablePush,
  isStandalone,
  pushErrorText,
  pushSupported,
} from "@/lib/pushClient";

// Customer push opt-in, used after booking, after joining the waitlist, on
// "Meine Termine" and on /app. The subscribe logic itself lives in
// lib/pushClient so the in-app banner (PushBanner) behaves identically.
//
// With `reminderOnly` the device receives ONLY reminder pushes for its booked
// appointments — never the "slot freed" radar messages (see /api/push).

export default function PushOptIn({
  date,
  email,
  reminderOnly = false,
  title,
  label = "🔔 Zusätzlich Sofort-Push aufs Handy",
  activeText = "🔔 Termin-Radar aktiv — du bekommst sofort eine Push-Nachricht auf diesem Gerät, wenn etwas frei wird.",
  hint,
  /** Why installing is worth it — shown to iPhone users who can't opt in yet. */
  installPitch = "Auf dem iPhone gehen Push-Nachrichten nur aus der App heraus.",
  /** Set where another install call-to-action already covers this screen. */
  hideInstallPitch = false,
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
  installPitch?: string;
  hideInstallPitch?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  // iOS only exposes the Push API inside an installed web app. Without this
  // branch iPhone visitors saw nothing at all and never learned that push
  // exists — which is why almost nobody had it enabled.
  const [needsInstall, setNeedsInstall] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "on" | "error">("idle");
  // Why it failed, so the customer sees something actionable instead of a
  // blanket "didn't work".
  const [errorText, setErrorText] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only feature detection (browser APIs unavailable during SSR) */
  useEffect(() => {
    if (pushSupported()) {
      setSupported(true);
      return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos && !isStandalone()) setNeedsInstall(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (needsInstall && hideInstallPitch) return null;

  if (needsInstall) {
    const box = (
      <div className="mt-2 text-center">
        <p className="text-xs leading-relaxed text-muted">{installPitch}</p>
        <a
          href="/app"
          className="mt-2 inline-block rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white"
        >
          📲 App in 20 Sekunden einrichten
        </a>
      </div>
    );
    if (!title) return box;
    return (
      <div className="mt-6 rounded-xl bg-surface px-4 py-3 text-center">
        <p className="text-sm font-medium">{title}</p>
        {box}
      </div>
    );
  }

  if (!supported) return null;

  async function enable() {
    setState("busy");
    setErrorText(null);
    const res = await enablePush({ date, email, reminderOnly });
    if (res === "ok") {
      setState("on");
      return;
    }
    setErrorText(pushErrorText(res));
    setState("error");
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
          {state === "busy" ? "…" : state === "error" ? "Nochmal versuchen" : label}
        </button>
        {state === "error" && (
          <p className="mt-1.5 text-xs text-muted">
            {errorText}
            <br />
            Die E-Mail-Benachrichtigung funktioniert unabhängig davon.
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
