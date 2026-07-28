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
  // Apple allows no programmatic install, so the manual steps are the whole
  // product here — shown as pictures of what to look for rather than prose,
  // because "tap the share icon" is easy to read past and hard to find.
  if (platform === "ios") {
    return (
      <div className="rounded-2xl border border-line bg-background p-5 shadow-soft">
        <h2 className="text-base font-bold">Auf dem iPhone — 3 Schritte</h2>

        <VisualStep
          n={1}
          text={
            <>
              Tippe <b>ganz unten in Safari</b> auf dieses Symbol:
            </>
          }
        >
          {/* Safari bottom bar with the share button called out. */}
          <div className="relative rounded-xl bg-surface p-3">
            <div className="flex items-center justify-around rounded-lg bg-background px-2 py-2.5 ring-1 ring-line">
              <BarIcon d="M15 18l-6-6 6-6" />
              <BarIcon d="M9 18l6-6-6-6" muted />
              <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 ring-2 ring-brand">
                <svg
                  className="h-5 w-5 text-brand"
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
              </span>
              <BarIcon d="M4 6h16M4 12h16M4 18h16" muted />
              <BarIcon d="M3 5h8v8H3zM13 11h8v8h-8z" muted />
            </div>
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
              hier tippen
            </span>
          </div>
        </VisualStep>

        <VisualStep
          n={2}
          text={
            <>
              Etwas nach unten wischen und <b>„Zum Home-Bildschirm“</b> wählen:
            </>
          }
        >
          {/* The share-sheet row they need to find. */}
          <div className="overflow-hidden rounded-xl bg-surface p-2">
            <div className="flex items-center justify-between rounded-lg px-3 py-2 opacity-40">
              <span className="text-sm">Lesezeichen hinzufügen</span>
              <SquareGlyph d="M6 4h9l5 5v11H6z" />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2.5 ring-2 ring-brand">
              <span className="text-sm font-semibold">Zum Home-Bildschirm</span>
              <SquareGlyph d="M12 8v8M8 12h8" brand />
            </div>
            <div className="flex items-center justify-between rounded-lg px-3 py-2 opacity-40">
              <span className="text-sm">Markierung hinzufügen</span>
              <SquareGlyph d="M4 7h16v10H4z" />
            </div>
          </div>
        </VisualStep>

        <VisualStep
          n={3}
          text={
            <>
              Oben rechts auf <b>„Hinzufügen“</b> — fertig.
            </>
          }
          last
        >
          <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
            <span className="text-sm text-muted">Abbrechen</span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                className="h-6 w-6 rounded-md object-cover"
              />
              {siteName}
            </span>
            <span className="rounded-lg bg-brand px-2.5 py-1 text-sm font-bold text-white">
              Hinzufügen
            </span>
          </div>
        </VisualStep>

        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Wichtig: Das klappt nur in <b>Safari</b>. Bist du gerade in Chrome
          oder im Instagram-Browser, öffne die Seite zuerst dort.
        </p>
      </div>
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

/** One numbered step with an illustration of what the screen looks like. */
function VisualStep({
  n,
  text,
  children,
  last,
}: {
  n: number;
  text: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "mt-5" : "mt-5 border-b border-line pb-5"}>
      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
          {n}
        </span>
        <span className="pt-0.5 text-sm leading-relaxed">{text}</span>
      </div>
      <div className="mt-3 pl-10">{children}</div>
    </div>
  );
}

/** Muted glyph standing in for the other buttons in Safari's toolbar. */
function BarIcon({ d, muted }: { d: string; muted?: boolean }) {
  return (
    <svg
      className={`h-5 w-5 ${muted ? "text-stone-300" : "text-stone-400"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path d={d} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Boxed glyph as used on the right of iOS share-sheet rows. */
function SquareGlyph({ d, brand }: { d: string; brand?: boolean }) {
  return (
    <svg
      className={`h-5 w-5 ${brand ? "text-brand" : "text-stone-400"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="4" strokeWidth="1.6" />
      <path d={d} strokeWidth="2" strokeLinecap="round" />
    </svg>
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

