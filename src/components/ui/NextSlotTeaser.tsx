"use client";

import { useEffect, useState } from "react";
import { formatDateTimeLabel } from "@/lib/time";
import { siteConfig } from "@/config/site";
import QuickBook from "./QuickBook";

// Client-side "next free slot" teaser. Fetches after paint so the expensive
// availability scan never blocks the landing page's first render — the hero
// shows instantly and the teaser fades in a moment later.
export default function NextSlotTeaser() {
  const [slot, setSlot] = useState<{ serviceId: string; start: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/next-slot", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.start && d?.serviceId) {
          setSlot({ serviceId: d.serviceId, start: d.start });
        }
      })
      .catch(() => {
        // Teaser is optional — silently skip it if the fetch fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!slot) return null;

  return (
    <QuickBook
      serviceId={slot.serviceId}
      start={slot.start}
      label={formatDateTimeLabel(new Date(slot.start), siteConfig.timezone)}
    />
  );
}
