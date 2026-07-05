"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Decode the base64url email from the stored magic-link credentials.
function decodeEmail(e: string): string {
  try {
    const b64 = e.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64);
  } catch {
    return "";
  }
}

export default function RequestLinkForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Magic-link credentials remembered on this device (set after the first
  // successful visit) — lets returning customers skip the email round trip.
  const [saved, setSaved] = useState<{ e: string; t: string } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only read of localStorage (not available during SSR) */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("kc_myappts");
      if (!raw) return;
      const creds = JSON.parse(raw) as { e?: string; t?: string };
      if (creds.e && creds.t) setSaved({ e: creds.e, t: creds.t });
    } catch {
      // Corrupt/blocked storage — show the normal email form.
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function forget() {
    try {
      localStorage.removeItem("kc_myappts");
    } catch {
      // Ignore — worst case the card shows again next visit.
    }
    setSaved(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/my-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
        return;
      }
      setDone(true);
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (saved) {
    const savedEmail = decodeEmail(saved.e);
    return (
      <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">
          Auf diesem Gerät angemeldet als
          <span className="mt-0.5 block truncate font-semibold text-foreground">
            {savedEmail || "gespeicherte E-Mail"}
          </span>
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href={`/meine-termine/liste?e=${encodeURIComponent(saved.e)}&t=${encodeURIComponent(saved.t)}`}
            className="rounded-full bg-brand py-3 text-center text-sm font-semibold text-white"
          >
            Meine Termine öffnen
          </Link>
          <button
            type="button"
            onClick={forget}
            className="text-xs text-muted underline underline-offset-4 hover:text-foreground"
          >
            Andere E-Mail verwenden / abmelden
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-5 rounded-xl bg-brand-soft px-4 py-4 text-sm font-medium text-brand-700">
        ✓ Wenn zu dieser E-Mail-Adresse Termine existieren, haben wir dir
        soeben einen Link geschickt. Schau in dein Postfach (ggf. auch im
        Spam-Ordner).
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="deine@email.de"
        autoComplete="email"
        className="w-full rounded-xl bg-surface px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-brand"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-brand py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {submitting ? "Wird gesendet…" : "Link anfordern"}
      </button>
    </form>
  );
}
