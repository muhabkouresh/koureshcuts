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
    <main className="flex flex-1 items-center justify-center px-5 py-20">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-line bg-background p-7 shadow-sm"
      >
        <h1 className="text-lg font-semibold">{siteConfig.name} · Admin</h1>
        <p className="mt-1 text-sm text-muted">
          Passwort eingeben, um Buchungen zu verwalten.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Passwort"
          className="mt-5 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-xl bg-foreground py-3 text-sm font-semibold text-background disabled:opacity-50"
        >
          {submitting ? "Wird angemeldet…" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
