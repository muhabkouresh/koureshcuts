"use client";

import { useEffect } from "react";

// Registers the service worker so the site is installable and works offline.
// Renders nothing.
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;
    let reloading = false;
    const controlledAtStart = Boolean(navigator.serviceWorker.controller);
    const changed = () => {
      if (controlledAtStart && !reloading && /^\/(admin|meine-termine|termin)(\/|$)/.test(location.pathname)) {
        reloading = true;
        location.reload();
      }
    };
    const check = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    };
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(value => {
        if (!disposed) { registration = value; check(); }
      }).catch(err => console.error("Service worker registration failed:", err));
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });

    }
    return () => {
      disposed = true;
      window.removeEventListener("load", register);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
    };
  }, []);

  return null;
}
