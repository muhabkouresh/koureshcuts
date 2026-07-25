"use client";

import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/config/site";
import PushOptIn from "./PushOptIn";

const siteName = siteConfig.name;

// Chrome's install event isn't in the TS DOM lib yet.
type BipEvent = Event & { prompt: () => Promise<void> };

type Platform = "ios" | "android" | "desktop";

// Device-aware install guide for the shareable /app page. Shows the steps that
// match the visitor's phone first, an Instagram/in-app-browser warning when
// relevant (installing is impossible there), and — on Android/desktop Chrome —
// a real one-tap install button via beforeinstallprompt.
export default function AppInstall() {
  const [platform, setPlatform] = useState<Platform>("ios");
  const [inApp, setInApp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const bipRef = useRef<BipEvent | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- client-only UA/display detection (unavailable during SSR) */
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    setPlatform(isIos ? "ios" : isAndroid ? "android" : "desktop");
    setInApp(
      /instagram|fbav|fban|fb_iab|tiktok|musical_ly|snapchat|line\/|micromessenger/i.test(
        ua,
      ),
    );
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone
    ) {
      setInstalled(true);
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      bipRef.current = e as BipEvent;
      setCanInstall(true);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function install() {
    const bip = bipRef.current;
    if (!bip) return;
    try {
      await bip.prompt();
    } catch {
      // Already used or dismissed — the manual steps below still work.
    }
  }

  if (installed) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
          <div className="text-4xl">✅</div>
          <p className="mt-3 text-lg font-bold text-emerald-800">
            Die App ist installiert
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            Öffne sie jederzeit über das {siteName}-Symbol auf deinem
            Home-Bildschirm.
          </p>
        </div>
        {/* The one thing left to switch on — and the reason push adoption was
            near zero before: this only works from inside the installed app. */}
        <PushOptIn
          title="Noch ein Schritt: Benachrichtigungen an"
          label="🔔 Benachrichtigungen aktivieren"
          activeText="🔔 Aktiv! Du bekommst deine Termin-Erinnerung und freie Plätze sofort aufs Handy."
          hint="Erinnerung vor deinem Termin + Sofort-Info, wenn ein Platz frei wird."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {inApp && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="text-sm font-bold text-amber-900">
            ⚠️ Zuerst im richtigen Browser öffnen
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Du bist gerade im In-App-Browser (z. B. Instagram). So installieren
            geht hier nicht. Tippe oben rechts auf{" "}
            <span className="font-semibold">⋯</span> und wähle{" "}
            <span className="font-semibold">„Im externen Browser öffnen“</span>{" "}
            — dann folge den Schritten unten.
          </p>
        </div>
      )}

      {/* Android / desktop Chrome: real one-tap install when available. */}
      {canInstall && (
        <button
          onClick={install}
          className="btn-shine w-full rounded-full bg-brand py-4 text-base font-semibold text-white shadow-[var(--shadow-brand)]"
        >
          📲 Jetzt als App installieren
        </button>
      )}

      <StepCard platform={platform} canInstall={canInstall} />
    </div>
  );
}

function StepCard({
  platform,
  canInstall,
}: {
  platform: Platform;
  canInstall: boolean;
}) {
  if (platform === "ios") {
    return (
      <Steps
        title="Auf dem iPhone (Safari)"
        steps={[
          <>
            Tippe unten in Safari auf das <b>Teilen-Symbol</b>{" "}
            <ShareIcon /> (Quadrat mit Pfeil nach oben).
          </>,
          <>
            Scrolle etwas nach unten und tippe auf{" "}
            <b>„Zum Home-Bildschirm“</b>.
          </>,
          <>
            Oben rechts auf <b>„Hinzufügen“</b> — fertig, das {siteName}-Symbol
            liegt jetzt auf deinem Home-Bildschirm.
          </>,
        ]}
        note="Wichtig: Das klappt nur in Safari. Bist du in Chrome oder im Instagram-Browser, öffne die Seite zuerst dort."
      />
    );
  }
  if (platform === "android") {
    return (
      <Steps
        title="Auf Android (Chrome)"
        steps={
          canInstall
            ? [
                <>
                  Tippe oben auf den Button{" "}
                  <b>„Jetzt als App installieren“</b>.
                </>,
                <>
                  Bestätige mit <b>„Installieren“</b> — fertig.
                </>,
              ]
            : [
                <>
                  Tippe oben rechts in Chrome auf das <b>Menü ⋮</b>.
                </>,
                <>
                  Wähle <b>„App installieren“</b> bzw.{" "}
                  <b>„Zum Startbildschirm hinzufügen“</b>.
                </>,
                <>
                  Bestätigen — das {siteName}-Symbol liegt jetzt auf deinem
                  Startbildschirm.
                </>,
              ]
        }
      />
    );
  }
  return (
    <Steps
      title="Am Computer (Chrome/Edge)"
      steps={[
        <>
          Klicke rechts in der Adressleiste auf das{" "}
          <b>Installations-Symbol</b> (Monitor mit Pfeil) — oder oben auf{" "}
          <b>Jetzt als App installieren</b>, falls angezeigt.
        </>,
        <>
          Bestätige mit <b>„Installieren“</b>.
        </>,
      ]}
      note="Am schönsten ist die App aber auf dem Handy — teile den Link einfach mit dir selbst."
    />
  );
}

function Steps({
  title,
  steps,
  note,
}: {
  title: string;
  steps: React.ReactNode[];
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <h2 className="text-base font-bold">{title}</h2>
      <ol className="mt-4 flex flex-col gap-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
              {i + 1}
            </span>
            <span className="pt-0.5 text-sm leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
      {note && <p className="mt-4 text-xs text-muted">{note}</p>}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      className="inline h-4 w-4 align-[-3px] text-brand"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-label="Teilen"
    >
      <path
        d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
