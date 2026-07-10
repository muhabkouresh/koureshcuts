"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { siteConfig } from "@/config/site";
import { priceShort, priceFull } from "@/lib/format";
import {
  dateKey,
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
// Per-service color themes — each service gets its own colour, threaded through
// the calendar selection and time slots so the booking isn't monotone.
const SERVICE_THEMES = [
  { bar: "bg-brand", solid: "bg-brand", ring: "ring-brand", hover: "hover:ring-brand" },
  {
    bar: "bg-blue-900",
    solid: "bg-blue-900",
    ring: "ring-blue-900",
    hover: "hover:ring-blue-900",
  },
  {
    bar: "bg-emerald-700",
    solid: "bg-emerald-700",
    ring: "ring-emerald-700",
    hover: "hover:ring-emerald-700",
  },
  {
    bar: "bg-amber-600",
    solid: "bg-amber-600",
    ring: "ring-amber-600",
    hover: "hover:ring-amber-600",
  },
];
function themeFor(i: number) {
  return SERVICE_THEMES[i % SERVICE_THEMES.length];
}

// Shared month-availability cache so the calendar shows instantly when a service
// is picked. We still re-fetch (no-store) on mount to stay fresh — the cache only
// removes the perceived wait; admin changes (time-off, hours) still show up.
type MonthData = { days: number[]; full: number[] };
const monthCache = new Map<string, MonthData>();
const monthKey = (serviceId: string, year: number, month0: number) =>
  `${serviceId}:${year}:${month0}`;

async function fetchMonth(
  serviceId: string,
  year: number,
  month0: number,
): Promise<MonthData> {
  const res = await fetch(
    `/api/availability/month?serviceId=${serviceId}&year=${year}&month=${month0}`,
    { cache: "no-store" },
  );
  const d = await res.json();
  const data: MonthData = { days: d.days ?? [], full: d.full ?? [] };
  monthCache.set(monthKey(serviceId, year, month0), data);
  return data;
}

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
  // Slot start requested by the hero quick-book teaser — selected as soon as
  // the day's slots arrive (and silently dropped if it was just taken).
  const pendingStartRef = useRef<string | null>(null);

  // Hero teaser hand-off: jump straight to the requested service + day.
  useEffect(() => {
    const onQuickBook = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        serviceId?: string;
        start?: string;
      } | null;
      if (!detail?.serviceId || !detail.start) return;
      const s = services.find((x) => x.id === detail.serviceId);
      if (!s) return;
      pendingStartRef.current = detail.start;
      setService(s);
      setSlot(null);
      setDate(dateKey(new Date(detail.start), tz));
      setStep("datetime");
    };
    window.addEventListener("kc:quickbook", onQuickBook);
    return () => window.removeEventListener("kc:quickbook", onQuickBook);
  }, [services]);

  // Returning customers: prefill name/email remembered from the last booking
  // on this device (localStorage only — nothing leaves the browser).
  /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only prefill from localStorage (not available during SSR) */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("kc_customer");
      if (!raw) return;
      const saved = JSON.parse(raw) as { name?: string; email?: string };
      if (saved.name) setName(saved.name);
      if (saved.email) setEmail(saved.email);
    } catch {
      // Corrupt/blocked storage — start with empty fields.
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Prefetch the current month's availability for every service as soon as the
  // booking section renders, so picking a service shows the calendar instantly.
  useEffect(() => {
    const today = todayInTz(tz);
    const [y, m] = today.split("-").map(Number);
    for (const s of services) {
      void fetchMonth(s.id, y, m - 1).catch(() => {});
    }
  }, [services]);

  // Load slots whenever the selected day changes.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional fetch-on-change loading state */
  useEffect(() => {
    if (!service || !date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSlot(null);
    fetch(`/api/availability?serviceId=${service.id}&date=${date}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const loaded: Slot[] = data.slots ?? [];
        setSlots(loaded);
        // Quick-book hand-off: pre-select the teased time and go straight to
        // the details form. If someone just grabbed it, stay on the times.
        const pending = pendingStartRef.current;
        if (pending) {
          pendingStartRef.current = null;
          const match = loaded.find((s) => s.start === pending);
          if (match) {
            setSlot(match);
            setStep("details");
          }
        }
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
    // Keep name/email — booking another appointment right away shouldn't
    // require retyping them.
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
            { cache: "no-store" },
          );
          const d = await r.json();
          setSlots(d.slots ?? []);
          setSlot(null);
          setStep("datetime");
        }
        return;
      }
      try {
        localStorage.setItem("kc_customer", JSON.stringify({ name, email }));
      } catch {
        // Storage unavailable (private mode) — skip remembering.
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
      <div className="mx-auto w-full max-w-lg">
        <Steps current="service" />
        <div key="service" className="animate-fade-up">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Services
          </h2>
          <p className="mt-1 text-muted">Wähle den Service, der zu dir passt.</p>
          <ul className="mt-6 flex flex-col gap-3.5">
            {services.map((s, i) => {
              const t = themeFor(i);
              return (
                <li
                  key={s.id}
                  className={`card-lift group flex cursor-pointer items-center overflow-hidden rounded-2xl bg-background shadow-soft ring-1 ring-line transition-shadow ${t.hover} hover:ring-2`}
                  onClick={() => chooseService(s)}
                >
                  <span
                    className={`h-full w-2 self-stretch ${t.bar}`}
                    aria-hidden
                  />
                  <div className="flex flex-1 items-center justify-between gap-3 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span
                        aria-hidden
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm ${t.solid}`}
                      >
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="whitespace-nowrap text-base font-semibold">
                          {s.name}{" "}
                          <span className="font-bold">
                            | {priceShort(s.priceCents)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          Dauer: {s.durationMinutes} Min.
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform group-hover:scale-[1.04] ${t.solid}`}
                    >
                      Auswählen{" "}
                      <span
                        aria-hidden
                        className="transition-transform group-hover:translate-x-0.5"
                      >
                        →
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // --- Steps with a service header ---
  const serviceIndex = service
    ? Math.max(
        0,
        services.findIndex((s) => s.id === service.id),
      )
    : 0;
  const theme = themeFor(serviceIndex);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Steps current={step} />
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
        <div key="datetime" className="mt-6 animate-fade-up">
          <Calendar
            serviceId={service.id}
            value={date}
            onChange={setDate}
            accent={theme.solid}
          />

          {date && (
            <div className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-line">
              <h3 className="text-sm font-semibold text-muted">Uhrzeit wählen</h3>
              {loadingSlots ? (
                <p className="mt-3 text-sm text-muted">Lädt Zeiten…</p>
              ) : slots.length === 0 ? (
                <>
                  <p className="mt-3 text-sm text-muted">
                    Keine freien Zeiten an diesem Tag.
                  </p>
                  <WaitlistBox serviceId={service.id} date={date} />
                </>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {slots.map((s) => {
                    const active = slot?.start === s.start;
                    return (
                      <button
                        key={s.start}
                        onClick={() => setSlot(s)}
                        className={`rounded-xl px-4 py-4 text-lg font-semibold shadow-sm ring-1 transition-colors ${
                          active
                            ? `${theme.solid} text-white ${theme.ring}`
                            : `bg-background ring-line ${theme.hover}`
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

          <GeneralWaitlistBox
            serviceId={service.id}
            defaultName={name}
            defaultEmail={email}
          />
        </div>
      )}

      {step === "details" && service && slot && (
        <form key="details" onSubmit={submit} className="mt-6 flex animate-fade-up flex-col gap-4">
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
            Mit dem Button &quot;Verbindlich buchen&quot; akzeptierst du unsere{" "}
            <Link
              href="/datenschutz"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Datenschutzerklärung
            </Link>
            .
          </p>
        </form>
      )}

      {step === "done" && result && (
        <div key="done" className="mt-2 animate-fade-up text-center">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
            <span
              aria-hidden
              className="animate-pop-check absolute inset-0 rounded-full bg-emerald-500"
            />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-emerald-500"
              style={{ animation: "ring-pulse 1.4s ease-out 0.3s 2" }}
            />
            <svg
              className="animate-pop-check relative h-8 w-8 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              style={{ animationDelay: "0.1s" }}
            >
              <path
                d="M20 6 9 17l-5-5"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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

          <p className="mt-6 text-sm font-medium text-muted">
            Zum Kalender hinzufügen
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <a
              href={result.gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-full bg-foreground py-3.5 text-sm font-semibold text-background"
            >
              Google Kalender
            </a>
            <a
              href={result.icsUrl}
              target="_blank"
              rel="noopener noreferrer"
              download="termin.ics"
              className="w-full rounded-full bg-background py-3.5 text-sm font-medium shadow-sm ring-1 ring-line hover:ring-foreground"
            >
              Apple Kalender
            </a>
            <button
              onClick={reset}
              className="mt-1 text-sm text-muted underline underline-offset-4 hover:text-foreground"
            >
              Weiteren Termin buchen
            </button>
          </div>

          {service && (
            <SecondSlotOffer
              service={service}
              firstEndIso={result.end}
              bookerEmail={email}
            />
          )}
        </div>
      )}
    </div>
  );
}

// After a successful booking: if the slot immediately after is still free,
// offer to book it for a second person (friend/brother) in one step —
// customers already do this manually by going through the flow twice.
function SecondSlotOffer({
  service,
  firstEndIso,
  bookerEmail,
}: {
  service: Service;
  firstEndIso: string;
  bookerEmail: string;
}) {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(bookerEmail);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const dateStr = dateKey(new Date(firstEndIso), tz);
    fetch(`/api/availability?serviceId=${service.id}&date=${dateStr}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const follow = (d.slots ?? []).find(
          (s: Slot) => s.start === firstEndIso,
        );
        if (follow) setSlot(follow);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [service.id, firstEndIso]);

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
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
          notes: "",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
        if (res.status === 409) setSlot(null);
        return;
      }
      setDone(true);
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!slot) return null;

  if (done) {
    return (
      <div className="mt-6 animate-fade-up rounded-2xl bg-emerald-50 px-5 py-4 text-left text-sm ring-1 ring-emerald-200">
        <p className="font-semibold text-emerald-800">
          ✓ Zweiter Termin gebucht — {formatClock(new Date(slot.start), tz)} Uhr
        </p>
        <p className="mt-1 text-emerald-700">
          Die Bestätigung wurde an{" "}
          <span className="font-medium">{email}</span> gesendet.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-5 text-left">
      {!open ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            <span className="font-semibold text-foreground">
              Kommst du zu zweit?
            </span>{" "}
            Der Termin direkt danach ({formatClock(new Date(slot.start), tz)}{" "}
            Uhr) ist noch frei.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background"
          >
            Termin anhängen
          </button>
        </div>
      ) : (
        <form onSubmit={book} className="flex animate-fade-up flex-col gap-3">
          <p className="text-sm font-semibold">
            {service.name} · {formatClock(new Date(slot.start), tz)} Uhr — für
            wen ist der zweite Termin?
          </p>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name der zweiten Person"
            autoComplete="off"
            className="w-full rounded-xl bg-background px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-brand"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail für die Bestätigung"
            className="w-full rounded-xl bg-background px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-brand"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Wird gebucht…" : "Verbindlich buchen"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-muted underline underline-offset-4"
            >
              Doch nicht
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Visual progress indicator across the three booking steps.
function Steps({ current }: { current: Step }) {
  const order: Step[] = ["service", "datetime", "details"];
  const activeIndex = current === "done" ? 3 : order.indexOf(current);
  const labels = ["Service", "Termin", "Daten"];

  return (
    <div className="mx-auto mb-8 flex max-w-md items-center justify-between">
      {labels.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ring-1 transition-all duration-300 ${
                  done
                    ? "bg-brand text-white ring-brand"
                    : active
                      ? "bg-brand-soft text-brand ring-brand"
                      : "bg-background text-muted ring-line"
                }`}
              >
                {done ? (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      d="M20 6 9 17l-5-5"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  active || done ? "text-foreground" : "text-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-500"
                  style={{ width: done ? "100%" : "0%" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Shown when a chosen day is fully booked — lets the customer join a waitlist.
function WaitlistBox({ serviceId, date }: { serviceId: string; date: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          date,
          customerName: name,
          customerEmail: email,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
        return;
      }
      if (typeof data.position === "number") setPosition(data.position);
      setDone(true);
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-4 animate-fade-up rounded-xl bg-brand-soft px-4 py-4 text-center text-sm font-medium text-brand-700">
        ✓ Du stehst auf der Warteliste
        {position !== null ? ` (Platz ${position})` : ""}. Wir melden uns per
        E-Mail, sobald an diesem Tag ein Platz frei wird.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      {!open ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Tag ausgebucht? Lass dich benachrichtigen, sobald etwas frei wird.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-shine shrink-0 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.03]"
          >
            Auf die Warteliste
          </button>
        </div>
      ) : (
        <form onSubmit={join} className="flex animate-fade-up flex-col gap-3">
          <p className="text-sm font-semibold">Warteliste für diesen Tag</p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail"
            autoComplete="email"
            className="w-full rounded-xl bg-background px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-brand"
          />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoComplete="name"
            className="w-full rounded-xl bg-background px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-brand"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-brand py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? "Wird eingetragen…" : "Eintragen"}
          </button>
        </form>
      )}
    </div>
  );
}

// Flexible waitlist: "next free slot, any day" — with optional preferred
// weekdays. Shown under the calendar so fully-booked visitors aren't lost.
function GeneralWaitlistBox({
  serviceId,
  defaultName,
  defaultEmail,
}: {
  serviceId: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [days, setDays] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const WEEKDAY_OPTIONS: [number, string][] = [
    [1, "Mo"],
    [2, "Di"],
    [3, "Mi"],
    [4, "Do"],
    [5, "Fr"],
    [6, "Sa"],
    [0, "So"],
  ];

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          weekdays: [...days],
          customerName: name,
          customerEmail: email,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen. Bitte erneut versuchen.");
        return;
      }
      if (typeof data.position === "number") setPosition(data.position);
      setDone(true);
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-4 animate-fade-up rounded-xl bg-brand-soft px-4 py-4 text-center text-sm font-medium text-brand-700">
        ✓ Du stehst auf der Warteliste
        {position !== null ? ` (Platz ${position})` : ""}. Wir melden uns per
        E-Mail, sobald ein passender Termin für dich frei wird.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      {!open ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Kein passender Termin dabei? Sichere dir den nächsten freien Platz.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full bg-background px-5 py-2 text-sm font-semibold shadow-sm ring-1 ring-line transition-colors hover:ring-brand"
          >
            Auf die Warteliste
          </button>
        </div>
      ) : (
        <form onSubmit={join} className="flex animate-fade-up flex-col gap-3">
          <p className="text-sm font-semibold">
            Warteliste — nächster freier Termin
          </p>
          <div>
            <p className="text-xs text-muted">
              Nur bestimmte Tage? (leer = jeder Tag passt)
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {WEEKDAY_OPTIONS.map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
                    days.has(d)
                      ? "bg-brand text-white ring-brand"
                      : "bg-background text-muted ring-line hover:ring-brand"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail"
            autoComplete="email"
            className="w-full rounded-xl bg-background px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-brand"
          />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoComplete="name"
            className="w-full rounded-xl bg-background px-4 py-3 text-sm outline-none ring-1 ring-line focus:ring-brand"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-brand py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? "Wird eingetragen…" : "Eintragen"}
          </button>
        </form>
      )}
    </div>
  );
}

// Exported for reuse in the reschedule flow (/termin/verschieben).
export function Calendar({
  serviceId,
  value,
  onChange,
  accent,
}: {
  serviceId: string;
  value: string | null;
  onChange: (date: string) => void;
  accent: string;
}) {
  const initial = useMemo(() => {
    const today = todayInTz(tz);
    const [y, m] = today.split("-").map(Number);
    return { year: y, month0: m - 1 };
  }, []);
  const [year, setYear] = useState(initial.year);
  const [month0, setMonth0] = useState(initial.month0);
  const seed = monthCache.get(monthKey(serviceId, initial.year, initial.month0));
  const [available, setAvailable] = useState<Set<number>>(
    () => new Set(seed?.days ?? []),
  );
  const [full, setFull] = useState<Set<number>>(() => new Set(seed?.full ?? []));
  const [loading, setLoading] = useState(!seed);

  const isCurrentView =
    year === initial.year && month0 === initial.month0;

  useEffect(() => {
    let cancelled = false;
    const cached = monthCache.get(monthKey(serviceId, year, month0));
    if (cached) {
      // Show the cached month instantly; revalidate silently below.
      setAvailable(new Set(cached.days));
      setFull(new Set(cached.full));
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchMonth(serviceId, year, month0)
      .then((d) => {
        if (!cancelled) {
          setAvailable(new Set(d.days));
          setFull(new Set(d.full));
        }
      })
      .catch(() => {
        if (!cancelled && !cached) {
          setAvailable(new Set());
          setFull(new Set());
        }
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
          const isFull = full.has(day);
          const selected = value === dateStr;
          return (
            <button
              key={dateStr}
              disabled={!enabled && !isFull}
              onClick={() => onChange(dateStr)}
              title={isFull && !enabled ? "Ausgebucht – Warteliste möglich" : undefined}
              className={`relative aspect-square rounded-lg text-sm transition-colors ${
                selected
                  ? isFull && !enabled
                    ? "bg-amber-500 font-bold text-white"
                    : `${accent} font-bold text-white`
                  : enabled
                    ? "font-semibold text-foreground hover:bg-surface"
                    : isFull
                      ? "font-semibold text-amber-600 hover:bg-amber-50"
                      : "text-stone-300 line-through"
              }`}
            >
              {day}
              {isFull && !enabled && !selected && (
                <span
                  aria-hidden
                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-500"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-3 text-center text-sm text-muted">
        <p>
          {loading
            ? "Lädt…"
            : value
              ? "Wähle eine Uhrzeit."
              : "Wähle zuerst einen Tag."}
        </p>
        {full.size > 0 && (
          <p className="flex items-center justify-center gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Ausgebucht — antippen für die Warteliste
          </p>
        )}
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
