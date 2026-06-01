"use client";

import { useEffect, useMemo, useState } from "react";
import { siteConfig } from "@/config/site";
import { priceShort, priceFull } from "@/lib/format";
import {
  daysInMonth,
  firstWeekdayMondayFirst,
  formatClock,
  formatDateTimeLabel,
  monthLabel,
  toDateStr,
  todayInTz,
} from "@/lib/time";

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
};

type Slot = { start: string; end: string };

type BookingResult = {
  id: string;
  serviceName: string;
  priceCents: number;
  start: string;
  end: string;
  icsUrl: string;
  gcalUrl: string;
};

type Step = "service" | "datetime" | "details" | "done";

const tz = siteConfig.timezone;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// Left accent bar colors for service cards (matches the live site).
const ACCENTS = ["bg-indigo-500", "bg-red-500", "bg-emerald-500", "bg-amber-500"];

export default function BookingFlow({ services }: { services: Service[] }) {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  // Load slots whenever the selected day changes.
  useEffect(() => {
    if (!service || !date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSlot(null);
    fetch(`/api/availability?serviceId=${service.id}&date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSlots(data.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service, date]);

  function chooseService(s: Service) {
    setService(s);
    setDate(null);
    setSlots([]);
    setSlot(null);
    setStep("datetime");
  }

  function reset() {
    setStep("service");
    setService(null);
    setDate(null);
    setSlots([]);
    setSlot(null);
    setName("");
    setEmail("");
    setNotes("");
    setError(null);
    setResult(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          start: slot.start,
          customerName: name,
          customerEmail: email,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
        if (res.status === 409 && date && service) {
          const r = await fetch(
            `/api/availability?serviceId=${service.id}&date=${date}`,
          );
          const d = await r.json();
          setSlots(d.slots ?? []);
          setSlot(null);
          setStep("datetime");
        }
        return;
      }
      setResult(data as BookingResult);
      setStep("done");
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  // --- Step: choose service ---
  if (step === "service") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <h2 className="text-3xl font-bold tracking-tight">Services</h2>
        <p className="mt-1 text-muted">Wähle den Service, der zu dir passt.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {services.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-line"
            >
              <span
                className={`h-full w-1.5 self-stretch ${ACCENTS[i % ACCENTS.length]}`}
                aria-hidden
              />
              <div className="flex flex-1 items-center justify-between gap-3 p-5">
                <div>
                  <p className="text-lg font-semibold">
                    {s.name}{" "}
                    <span className="font-bold">| {priceShort(s.priceCents)}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Dauer: {s.durationMinutes} Min.
                  </p>
                </div>
                <button
                  onClick={() => chooseService(s)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
                >
                  Auswählen <span aria-hidden>→</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // --- Steps with a service header ---
  return (
    <div className="mx-auto w-full max-w-2xl">
      {service && (
        <div className="flex items-center gap-4">
          {step !== "done" && (
            <button
              onClick={() => setStep(step === "details" ? "datetime" : "service")}
              className="inline-flex items-center gap-1.5 rounded-full bg-background px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-line hover:ring-foreground"
            >
              <span aria-hidden>←</span> Zurück
            </button>
          )}
          <div>
            <h2 className="text-2xl font-bold leading-tight">{service.name}</h2>
            <p className="text-sm text-muted">
              {priceShort(service.priceCents)} • {service.durationMinutes} Min.
            </p>
          </div>
        </div>
      )}

      {step === "datetime" && service && (
        <div className="mt-6">
          <Calendar serviceId={service.id} value={date} onChange={setDate} />

          {date && (
            <div className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-line">
              <h3 className="text-sm font-semibold text-muted">Uhrzeit wählen</h3>
              {loadingSlots ? (
                <p className="mt-3 text-sm text-muted">Lädt Zeiten…</p>
              ) : slots.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  Keine freien Zeiten an diesem Tag. Bitte anderen Tag wählen.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((s) => {
                    const active = slot?.start === s.start;
                    return (
                      <button
                        key={s.start}
                        onClick={() => setSlot(s)}
                        className={`rounded-lg px-2 py-2 text-sm ring-1 transition-colors ${
                          active
                            ? "bg-foreground text-background ring-foreground"
                            : "bg-background ring-line hover:ring-foreground"
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

          <button
            disabled={!slot}
            onClick={() => setStep("details")}
            className="mt-6 w-full rounded-full bg-foreground py-3.5 text-sm font-semibold text-background transition-opacity disabled:bg-zinc-400"
          >
            Weiter
          </button>
        </div>
      )}

      {step === "details" && service && slot && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Field
            label="E-Mail *"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="max@beispiel.de"
            required
          />
          <Field
            label="Vollständiger Name *"
            value={name}
            onChange={setName}
            autoComplete="name"
            placeholder="Max Mustermann"
            required
          />
          <div>
            <label className="text-sm font-semibold">Terminnotiz (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional für den Anbieter"
              className="mt-1.5 w-full rounded-xl bg-background px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-foreground"
            />
          </div>

          <DetailsCard
            serviceName={service.name}
            durationMinutes={service.durationMinutes}
            priceCents={service.priceCents}
            start={slot.start}
          />

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-foreground py-3.5 text-sm font-semibold text-background transition-opacity disabled:bg-zinc-400"
          >
            {submitting ? "Wird gebucht…" : "Verbindlich buchen"}
          </button>
          <p className="text-center text-xs text-muted">
            Mit dem Button &quot;Verbindlich buchen&quot; akzeptierst du unsere
            Nutzungsbedingungen und Datenschutzerklärung.
          </p>
        </form>
      )}

      {step === "done" && result && (
        <div className="mt-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white">
            ✓
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight">
            Termin erfolgreich gebucht
          </h2>
          <p className="mt-3 text-muted">
            Wir haben dir eine Bestätigungsmail an{" "}
            <span className="font-medium text-foreground">{email}</span> gesendet.
          </p>

          <div className="mt-8 text-left">
            <h3 className="text-lg font-bold">Termindetails</h3>
            <DetailsCard
              serviceName={result.serviceName}
              durationMinutes={service?.durationMinutes ?? 0}
              priceCents={result.priceCents}
              start={result.start}
              note={notes}
              full
            />
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <a
              href={result.gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-full bg-foreground py-3.5 text-sm font-semibold text-background"
            >
              Zum Google Kalender hinzufügen
            </a>
            <a
              href={result.icsUrl}
              className="w-full rounded-full bg-background py-3.5 text-sm font-medium shadow-sm ring-1 ring-line hover:ring-foreground"
            >
              Kalenderdatei (.ics) herunterladen
            </a>
            <button
              onClick={reset}
              className="mt-1 text-sm text-muted underline underline-offset-4 hover:text-foreground"
            >
              Weiteren Termin buchen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Calendar({
  serviceId,
  value,
  onChange,
}: {
  serviceId: string;
  value: string | null;
  onChange: (date: string) => void;
}) {
  const initial = useMemo(() => {
    const today = todayInTz(tz);
    const [y, m] = today.split("-").map(Number);
    return { year: y, month0: m - 1 };
  }, []);
  const [year, setYear] = useState(initial.year);
  const [month0, setMonth0] = useState(initial.month0);
  const [available, setAvailable] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const isCurrentView =
    year === initial.year && month0 === initial.month0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/availability/month?serviceId=${serviceId}&year=${year}&month=${month0}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAvailable(new Set<number>(d.days ?? []));
      })
      .catch(() => {
        if (!cancelled) setAvailable(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, year, month0]);

  function shiftMonth(delta: number) {
    let m = month0 + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setYear(y);
    setMonth0(m);
  }

  const total = daysInMonth(year, month0);
  const lead = firstWeekdayMondayFirst(year, month0);
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-line">
      <div className="flex items-center justify-between">
        <button
          onClick={() => shiftMonth(-1)}
          disabled={isCurrentView}
          aria-label="Vorheriger Monat"
          className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-line hover:ring-foreground disabled:opacity-30"
        >
          ‹
        </button>
        <p className="text-base font-bold">{monthLabel(year, month0)}</p>
        <button
          onClick={() => shiftMonth(1)}
          aria-label="Nächster Monat"
          className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-line hover:ring-foreground"
        >
          ›
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`b${idx}`} />;
          const dateStr = toDateStr(year, month0, day);
          const enabled = available.has(day);
          const selected = value === dateStr;
          return (
            <button
              key={dateStr}
              disabled={!enabled}
              onClick={() => onChange(dateStr)}
              className={`aspect-square rounded-lg text-sm transition-colors ${
                selected
                  ? "bg-foreground font-bold text-background"
                  : enabled
                    ? "font-semibold text-foreground hover:bg-surface"
                    : "text-zinc-300 line-through"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-line pt-3 text-center text-sm text-muted">
        {loading
          ? "Lädt…"
          : value
            ? "Wähle eine Uhrzeit."
            : "Wähle zuerst einen Tag."}
      </div>
    </div>
  );
}

function DetailsCard({
  serviceName,
  durationMinutes,
  priceCents,
  start,
  note,
  full,
}: {
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
  start: string;
  note?: string;
  full?: boolean;
}) {
  return (
    <div className="mt-3 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-line">
      <Row label="Service" value={serviceName} />
      {full && (
        <Row label="Termin" value={formatDateTimeLabel(new Date(start), tz)} />
      )}
      <Row label="Dauer" value={`${durationMinutes} Min.`} />
      <Row
        label="Preis"
        value={full ? priceFull(priceCents) : priceShort(priceCents)}
      />
      {!full && (
        <Row label="Termin" value={formatDateTimeLabel(new Date(start), tz)} />
      )}
      {full && <Row label="Terminnotiz" value={note?.trim() ? note : "-"} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line py-2.5 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-semibold">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl bg-background px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-foreground"
      />
    </div>
  );
}
