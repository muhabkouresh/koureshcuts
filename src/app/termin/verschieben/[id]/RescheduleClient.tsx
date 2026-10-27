"use client";

import { useState } from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Calendar } from "@/components/booking/BookingFlow";
import { formatClock, formatDateTimeLabel } from "@/lib/timeFormat";

import { useLiveResource } from "@/hooks/useLiveResource";
import { validDaySlots, type DaySlots } from "@/lib/availabilityClient";
type Slot = { start: string; end: string };

type RescheduleResult = {
  start: string;
  icsUrl: string;
  gcalUrl: string;
};

const tz = siteConfig.timezone;

// Self-service reschedule: pick a new day + time for an existing appointment.
export default function RescheduleClient({
  id,
  token,
  serviceId,
  serviceName,
  durationMinutes,
  currentLabel,
}: {
  id: string;
  token: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  currentLabel: string;
}) {
  const [date, setDate] = useState<string | null>(null);
  const day = useLiveResource<DaySlots>(date ? `/api/availability?serviceId=${encodeURIComponent(serviceId)}&date=${date}` : null, { intervalMs: 45_000, validate: validDaySlots });
  const slots = day.data?.slots ?? [];
  const loadingSlots = !day.data && !day.error;
  const [slot, setSlot] = useState<Slot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RescheduleResult | null>(null);

  async function submit() {
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/appointments/${id}/reschedule?t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: slot.start }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
        if (res.status === 409 && date) {
          setSlot(null);
          day.refresh();
        }
        return;
      }
      setResult(data as RescheduleResult);
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mt-4 animate-fade-up">
        <p className="text-sm">
          Dein Termin wurde <span className="font-semibold">verschoben</span>.
        </p>
        <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
          <p className="font-medium">{serviceName}</p>
          <p className="mt-0.5 text-muted line-through">{currentLabel}</p>
          <p className="mt-0.5 font-semibold">
            {formatDateTimeLabel(new Date(result.start), tz)}
          </p>
        </div>
        <p className="mt-4 text-sm font-medium text-muted">
          Zum Kalender hinzufügen
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <a
            href={result.gcalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-full bg-foreground py-3 text-center text-sm font-semibold text-background"
          >
            Google Kalender
          </a>
          <a
            href={result.icsUrl}
            target="_blank"
            rel="noopener noreferrer"
            download="termin.ics"
            className="w-full rounded-full bg-background py-3 text-center text-sm font-medium shadow-sm ring-1 ring-line hover:ring-foreground"
          >
            Apple Kalender
          </a>
        </div>
        <p className="mt-4 text-xs text-muted">
          Die Bestätigung wird dir per E-Mail zugesendet.{" "}
          <Link href="/" className="text-brand underline underline-offset-2">
            Zur Startseite
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-muted">Wähle eine neue Zeit für deinen Termin:</p>
      <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
        <p className="font-medium">
          {serviceName} · {durationMinutes} Min.
        </p>
        <p className="mt-0.5 text-muted">Aktuell: {currentLabel}</p>
      </div>

      <div className="mt-5">
        <Calendar
          serviceId={serviceId}
          value={date}
          onChange={(value) => { setSlot(null); setDate(value); }}
          accent="bg-brand"
        />
      </div>

      {date && (
        <div className="mt-5 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-line">
          <h3 className="text-sm font-semibold text-muted">Neue Uhrzeit wählen</h3>
          {day.error ? (<div role="alert"><p>Termine konnten nicht geladen werden.</p><button type="button" onClick={() => day.refresh()} className="underline">Erneut versuchen</button></div>) : loadingSlots ? (
            <p className="mt-3 text-sm text-muted">Lädt Zeiten…</p>
          ) : slots.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Keine freien Zeiten an diesem Tag.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {slots.map((s) => {
                const active = slot?.start === s.start;
                return (
                  <button
                    key={s.start}
                    onClick={() => setSlot(s)}
                    className={`rounded-xl px-4 py-3.5 text-base font-semibold shadow-sm ring-1 transition-colors ${
                      active
                        ? "bg-brand text-white ring-brand"
                        : "bg-background ring-line hover:ring-brand"
                    }`}
                  >
                    {formatClock(new Date(s.start), tz)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={submitting || !slot || Boolean(day.error) || !slots.some(time => time.start === slot.start)}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "Wird verschoben…" : "Termin verschieben"}
        </button>
        <Link
          href="/"
          className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Abbrechen
        </Link>
      </div>
    </div>
  );
}
