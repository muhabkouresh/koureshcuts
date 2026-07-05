"use client";

import { useState } from "react";

export default function RequestLinkForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
