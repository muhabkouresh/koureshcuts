"use client";

import { useState } from "react";
import { siteConfig } from "@/config/site";

export default function CancelClient({
  id,
  token,
  serviceName,
  whenLabel,
  alreadyCancelled,
}: {
  id: string;
  token: string;
  serviceName: string;
  whenLabel: string;
  alreadyCancelled: boolean;
}) {
  const [done, setDone] = useState(alreadyCancelled);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/appointments/${id}/cancel?t=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Stornierung fehlgeschlagen.");
        return;
      }
      setDone(true);
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-4">
        <p className="text-sm">
          Dein Termin wurde <span className="font-semibold">storniert</span>.
        </p>
        <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
          <p className="font-medium">{serviceName}</p>
          <p className="mt-0.5 text-muted line-through">{whenLabel}</p>
        </div>
        <p className="mt-4 text-xs text-muted">
          Du möchtest einen neuen Termin? Buche jederzeit auf{" "}
          <a href="/" className="text-brand underline underline-offset-2">
            unserer Seite
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-muted">Möchtest du diesen Termin absagen?</p>
      <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
        <p className="font-medium">{serviceName}</p>
        <p className="mt-0.5 text-muted">{whenLabel}</p>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={cancel}
          disabled={submitting}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "Wird storniert…" : "Termin absagen"}
        </button>
        <a
          href="/"
          className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Doch nicht
        </a>
      </div>
      <p className="mt-4 text-xs text-muted">
        Fragen? Ruf uns an: {siteConfig.phone}.
      </p>
    </div>
  );
}
