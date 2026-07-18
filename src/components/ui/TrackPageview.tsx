"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Fire-and-forget page-view beacon for the admin Statistik tab. Skips admin
// pages and local development; the server additionally filters bots.
export default function TrackPageview() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (window.location.hostname === "localhost") return;
    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || undefined,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/track",
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        void fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      /* tracking must never break the page */
    }
  }, [pathname]);

  return null;
}
