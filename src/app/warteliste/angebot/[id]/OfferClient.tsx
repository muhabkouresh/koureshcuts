"use client";

import { useState } from "react";
import Link from "next/link";

// Accept/decline UI of an exclusive waitlist slot offer.
export default function OfferClient({
  id,
  token,
  customerName,
  serviceName,
  priceLabel,
  whenLabel,
  expiresLabel,
}: {
  id: string;
  token: string;
  customerName: string;
  serviceName: string;
  priceLabel: string;
  whenLabel: string;
  expiresLabel: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "booked" | "declined">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "decline") {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(
        `/api/waitlist/offer/${id}?t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
        setState("idle");
        return;
      }
      setState(action === "accept" ? "booked" : "declined");
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
      setState("idle");
    }
  }

  if (state === "booked") {
    return (
      <div className="mt-4 animate-fade-up">
        <p className="text-sm">
          ✓ <span className="font-semibold">Termin gebucht!</span> Die
          Bestätigung mit Kalender-Eintrag ist unterwegs in dein Postfach.
        </p>
        <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
          <p className="font-medium">{serviceName}</p>
          <p className="mt-0.5 font-semibold">{whenLabel}</p>
          <p className="mt-0.5 text-muted">{priceLabel} · Zahlung vor Ort</p>
        </div>
      </div>
    );
  }

  if (state === "declined") {
    return (
      <p className="mt-4 text-sm text-muted">
        Alles klar — der Termin geht an die nächste Person. Du bleibst auf der
        Warteliste und bekommst das nächste passende Angebot automatisch.{" "}
        <Link href="/" className="text-brand underline underline-offset-2">
          Zur Startseite
        </Link>
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-muted">
        Hallo {customerName} — du bist dran! Dieser Termin ist exklusiv für
        dich reserviert (bis {expiresLabel}):
      </p>
      <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
        <p className="font-medium">{serviceName}</p>
        <p className="mt-0.5 text-base font-semibold">{whenLabel}</p>
        <p className="mt-0.5 text-muted">{priceLabel} · Zahlung vor Ort</p>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          onClick={() => act("accept")}
          disabled={state === "busy"}
          className="btn-shine w-full rounded-full bg-brand py-3.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {state === "busy" ? "Einen Moment…" : "Termin verbindlich buchen"}
        </button>
        <button
          onClick={() => act("decline")}
          disabled={state === "busy"}
          className="w-full rounded-full bg-background py-3 text-sm font-medium text-muted shadow-sm ring-1 ring-line hover:text-foreground disabled:opacity-50"
        >
          Passt nicht — an die nächste Person weitergeben
        </button>
      </div>
    </div>
  );
}
