"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Anmeldung fehlgeschlagen.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="hero-glow flex flex-1 items-center justify-center px-5 py-20">
      <form
        onSubmit={submit}
        className="animate-scale-in w-full max-w-sm rounded-3xl border border-line bg-background p-8 shadow-elevated"
      >
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt={siteConfig.name}
            className="h-14 w-14 rounded-full object-cover ring-1 ring-line"
          />
          <h1 className="mt-4 font-display text-xl font-bold tracking-tight">
            {siteConfig.name} <span className="text-brand">· Admin</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Passwort eingeben, um Buchungen zu verwalten.
          </p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Passwort"
          className="mt-6 w-full rounded-xl border border-line bg-page px-4 py-3 text-sm outline-none ring-1 ring-transparent transition focus:border-brand focus:ring-brand/30"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="btn-shine mt-5 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-[var(--shadow-brand)] transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {submitting ? "Wird angemeldet…" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
