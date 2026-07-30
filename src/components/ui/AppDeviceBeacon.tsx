"use client";

import { useEffect } from "react";
import { isStandalone } from "@/lib/pushClient";

const ID_KEY = "kc_device_id";

// Counts installed apps for the admin Statistik tab. Fires once per app start
// and only when the site is running standalone (home-screen icon) — a browser
// tab never reports. The id lives in localStorage, so the same device stays
// one row no matter how often the app is opened.
export default function AppDeviceBeacon() {
  useEffect(() => {
    if (window.location.hostname === "localhost") return;
    if (!isStandalone()) return;

    let deviceId: string | null = null;
    try {
      deviceId = localStorage.getItem(ID_KEY);
      if (!deviceId || !/^[a-f0-9]{32}$/.test(deviceId)) {
        deviceId = crypto.randomUUID().replace(/-/g, "");
        localStorage.setItem(ID_KEY, deviceId);
      }
    } catch {
      // Private mode / storage blocked — skip rather than count a new device
      // on every single app start.
      return;
    }

    const payload = JSON.stringify({ deviceId });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/app-device",
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        void fetch("/api/app-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      /* counting must never break the app */
    }
  }, []);

  return null;
}
