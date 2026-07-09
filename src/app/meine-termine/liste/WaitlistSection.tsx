"use client";

import { useState } from "react";

type Entry = {
  id: string;
  serviceName: string;
  wishLabel: string;
  position: number;
};

// The customer's waitlist entries with queue position and self-removal.
export default function WaitlistSection({
  entries: initial,
  e,
  t,
}: {
  entries: Entry[];
  e: string;
  t: string;
}) {
  const [entries, setEntries] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  async function remove(id: string) {
    setBusyId(id);
    try {
      await fetch("/api/waitlist/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, e, t }),
      });
      setEntries((prev) => prev.filter((x) => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold text-muted">Warteliste</h3>
      <ul className="mt-3 flex flex-col gap-2">
        {entries.map((w) => (
          <li
            key={w.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
          >
            <span className="min-w-0">
              <span className="block font-medium">{w.serviceName}</span>
              <span className="block text-xs text-muted">{w.wishLabel}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                Platz {w.position}
              </span>
              <button
                disabled={busyId === w.id}
                onClick={() => remove(w.id)}
                className="text-xs text-muted underline underline-offset-4 hover:text-red-600 disabled:opacity-50"
              >
                Austragen
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
