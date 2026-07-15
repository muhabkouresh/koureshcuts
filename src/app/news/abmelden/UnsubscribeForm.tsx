"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function UnsubscribeForm() {
  const params = useSearchParams();
  const e = params.get("e") ?? "";
  const t = params.get("t") ?? "";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let email = "";
  try {
    email = atob(e.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    /* invalid link — handled below */
  }

  if (!e || !t || !email) {
    return (
      <p className="mt-5 rounded-lg bg-surface px-3 py-3 text-sm text-muted">
        Dieser Link ist ungültig. Bitte nutze den Abmelde-Link aus einer
        unserer E-Mails.
      </p>
    );
  }

  if (done) {
    return (
      <div className="mt-5">
        <p className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800">
          Erledigt — <strong>{email}</strong> erhält keine Rundmails mehr.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Zurück zur Startseite
        </Link>
      </div>
    );
  }

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/news/abmelden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ e, t }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Abmelden fehlgeschlagen. Bitte erneut versuchen.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <p className="text-sm">
        E-Mail-Adresse: <strong>{email}</strong>
      </p>
      <button
        disabled={busy}
        onClick={unsubscribe}
        className="mt-4 w-full rounded-full bg-brand px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "…" : "Abmeldung bestätigen"}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
