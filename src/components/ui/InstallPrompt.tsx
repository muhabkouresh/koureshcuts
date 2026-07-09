"use client";

import { useEffect, useRef, useState } from "react";

// Chrome's install event isn't in the TS DOM lib yet.
type BipEvent = Event & { prompt: () => Promise<void> };

// Dismissible "install as app" hint. Android/Chrome gets a real install
// button (native prompt); iOS Safari gets the share-sheet instructions.
// Never shown inside an installed app or after being dismissed once.
export default function InstallPrompt() {
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  const bipRef = useRef<BipEvent | null>(null);

  useEffect(() => {
    // Already running as an installed app?
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ((navigator as unknown as { standalone?: boolean }).standalone) return;
    try {
      if (localStorage.getItem("kc_install_dismissed")) return;
    } catch {
      // Blocked storage — better to stay quiet than to nag on every visit.
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const onBip = (e: Event) => {
      e.preventDefault();
      bipRef.current = e as BipEvent;
      timer = setTimeout(() => setMode("android"), 2500);
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no install event — show the how-to in Safari only (other iOS
    // browsers can't add to the home screen).
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opt\//i.test(ua);
    if (isIos && isSafari) {
      timer = setTimeout(() => setMode("ios"), 2500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem("kc_install_dismissed", "1");
    } catch {
      // Ignore — the banner just reappears next visit.
    }
    setMode("hidden");
  }

  async function install() {
    const bip = bipRef.current;
    if (!bip) return;
    try {
      await bip.prompt();
    } catch {
      // Prompt already used or blocked — nothing else to do.
    }
    dismiss();
  }

  if (mode === "hidden") return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md animate-fade-up rounded-2xl border border-line bg-background/95 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-line"
        />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Als App installieren</p>
          {mode === "android" ? (
            <p className="mt-0.5 text-xs text-muted">
              Buche noch schneller — mit eigenem Icon auf deinem
              Home-Bildschirm.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Tippe auf{" "}
              <svg
                className="inline h-3.5 w-3.5 align-[-2px]"
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
              </svg>{" "}
              <span className="font-medium text-foreground">Teilen</span> und
              dann{" "}
              <span className="font-medium text-foreground">
                „Zum Home-Bildschirm“
              </span>
              .
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Hinweis schließen"
          className="shrink-0 rounded-full p-1 text-muted hover:bg-surface hover:text-foreground"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              d="M6 6l12 12M18 6L6 18"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {mode === "android" && (
        <button
          onClick={install}
          className="btn-shine mt-3 w-full rounded-full bg-brand py-2.5 text-sm font-semibold text-white"
        >
          App installieren
        </button>
      )}
    </div>
  );
}
