"use client";

import { useEffect, useState } from "react";
import {
  enablePush,
  isStandalone,
  pushAlreadyOn,
  pushSupported,
} from "@/lib/pushClient";

const DISMISS_KEY = "kc_push_banner_dismissed";

/**
 * One-time nudge inside the installed app: switching notifications on used to
 * be buried behind a footer link, so almost nobody found it. Shown only when
 * the app is installed, push works, notifications are still off, and the
 * banner hasn't been dismissed before.
 */
export default function PushBanner() {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "on" | "denied" | "error">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isStandalone() || !pushSupported()) return;
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        // Storage blocked — better to stay quiet than nag on every launch.
        return;
      }
      if (await pushAlreadyOn()) return;
      if (!cancelled) setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore — it just reappears next launch.
    }
    setShow(false);
  }

  async function turnOn() {
    setState("busy");
    const res = await enablePush();
    if (res === "ok") {
      setState("on");
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // Non-critical.
      }
      window.setTimeout(() => setShow(false), 2600);
      return;
    }
    setState(res === "denied" ? "denied" : "error");
  }

  if (!show) return null;

  if (state === "on") {
    return (
      <p className="animate-fade-up mb-6 w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800">
        🔔 Benachrichtigungen sind an — du verpasst keinen freien Termin mehr.
      </p>
    );
  }

  return (
    <div className="animate-fade-up mb-6 w-full max-w-md text-left">
      <div className="rounded-2xl border border-brand/30 bg-brand-soft/70 p-4 shadow-soft backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden>
            🔔
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Benachrichtigungen aktivieren</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Erinnerung vor deinem Termin — und sofort Bescheid, wenn kurzfristig
              ein Platz frei wird.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Hinweis schließen"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-muted hover:bg-background/60 hover:text-foreground"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <button
          onClick={turnOn}
          disabled={state === "busy"}
          className="btn-shine mt-3 w-full rounded-full bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {state === "busy" ? "Wird aktiviert…" : "Jetzt aktivieren"}
        </button>

        {state === "denied" && (
          <p className="mt-2 text-xs text-muted">
            Du hast Benachrichtigungen abgelehnt. Du kannst sie in den
            Einstellungen deines Handys für diese App wieder erlauben.
          </p>
        )}
        {state === "error" && (
          <p className="mt-2 text-xs text-muted">
            Hat nicht geklappt — versuch es später noch einmal.
          </p>
        )}
      </div>
    </div>
  );
}
