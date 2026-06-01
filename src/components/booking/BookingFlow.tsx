"use client";

import { useEffect, useMemo, useState } from "react";
import { siteConfig } from "@/config/site";
import {
  addDaysToDateStr,
  dayChipLabel,
  formatDateTimeLabel,
  formatTimeLabel,
  todayInTz,
  weekdayOf,
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

function money(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function BookingFlow({
  services,
  openWeekdays,
}: {
  services: Service[];
  openWeekdays: number[];
}) {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  // Upcoming bookable days (open weekdays within the booking window).
  const days = useMemo(() => {
    const open = new Set(openWeekdays);
    const today = todayInTz(tz);
    const out: string[] = [];
    for (let i = 0; i < siteConfig.bookingWindowDays && out.length < 14; i++) {
      const d = addDaysToDateStr(today, i);
      if (open.has(weekdayOf(d))) out.push(d);
    }
    return out;
  }, [openWeekdays]);

  // Fetch slots whenever the selected date changes.
  useEffect(() => {
    if (!service || !date) return;
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
    setPhone("");
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
          customerPhone: phone,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        // If the slot was taken, refresh availability.
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
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Stepper step={step} />

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-7">
        {step === "service" && (
          <section>
            <h3 className="text-sm font-medium text-muted">Choose a service</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {services.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => chooseService(s)}
                    className="group flex w-full items-center justify-between rounded-xl border border-line bg-background px-4 py-4 text-left transition-colors hover:border-foreground"
                  >
                    <span>
                      <span className="block font-medium">{s.name}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {s.description}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {s.durationMinutes} min
                      </span>
                    </span>
                    <span className="ml-4 shrink-0 text-base font-semibold">
                      {money(s.priceCents)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === "datetime" && service && (
          <section>
            <BackRow onClick={() => setStep("service")} label={service.name} />
            <h3 className="mt-4 text-sm font-medium text-muted">Pick a day</h3>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => {
                const c = dayChipLabel(d);
                const active = d === date;
                return (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-2.5 transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-line bg-background hover:border-foreground"
                    }`}
                  >
                    <span className="text-[11px] uppercase tracking-wide opacity-70">
                      {c.weekday}
                    </span>
                    <span className="text-lg font-semibold leading-tight">
                      {c.day}
                    </span>
                    <span className="text-[11px] opacity-70">{c.month}</span>
                  </button>
                );
              })}
            </div>

            {date && (
              <>
                <h3 className="mt-6 text-sm font-medium text-muted">
                  Pick a time
                </h3>
                {loadingSlots ? (
                  <p className="mt-3 text-sm text-muted">Loading times…</p>
                ) : slots.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    No times available this day. Try another day.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => {
                      const active = slot?.start === s.start;
                      return (
                        <button
                          key={s.start}
                          onClick={() => setSlot(s)}
                          className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-line bg-background hover:border-foreground"
                          }`}
                        >
                          {formatTimeLabel(new Date(s.start), tz)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            <button
              disabled={!slot}
              onClick={() => setStep("details")}
              className="mt-6 w-full rounded-xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
            >
              Continue
            </button>
          </section>
        )}

        {step === "details" && service && slot && (
          <section>
            <BackRow onClick={() => setStep("datetime")} label="Your details" />
            <div className="mt-4 rounded-xl border border-line bg-background p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{service.name}</span>
                <span className="font-semibold">{money(service.priceCents)}</span>
              </div>
              <p className="mt-1 text-muted">
                {formatDateTimeLabel(new Date(slot.start), tz)}
              </p>
            </div>

            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              <Field
                label="Name"
                value={name}
                onChange={setName}
                autoComplete="name"
                required
              />
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                required
              />
              <Field
                label="Phone"
                type="tel"
                value={phone}
                onChange={setPhone}
                autoComplete="tel"
                required
              />
              <div>
                <label className="text-sm font-medium">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                  placeholder="Anything we should know?"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-1 w-full rounded-xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity disabled:opacity-50"
              >
                {submitting ? "Booking…" : "Confirm booking"}
              </button>
              <p className="text-center text-xs text-muted">
                Pay in shop · You&apos;ll get a confirmation email
              </p>
            </form>
          </section>
        )}

        {step === "done" && result && (
          <section className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
              ✓
            </div>
            <h3 className="mt-4 text-lg font-semibold">You&apos;re booked!</h3>
            <p className="mt-1 text-sm text-muted">
              {result.serviceName} ·{" "}
              {formatDateTimeLabel(new Date(result.start), tz)}
            </p>
            <p className="mt-1 text-sm text-muted">
              A confirmation has been sent to your email.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <a
                href={result.gcalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-xl bg-foreground py-3 text-sm font-semibold text-background"
              >
                Add to Google Calendar
              </a>
              <a
                href={result.icsUrl}
                className="w-full rounded-xl border border-line bg-background py-3 text-sm font-medium hover:border-foreground"
              >
                Download calendar file (.ics)
              </a>
              <button
                onClick={reset}
                className="mt-1 text-sm text-muted underline underline-offset-4"
              >
                Book another appointment
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const order: Step[] = ["service", "datetime", "details", "done"];
  const labels = ["Service", "Time", "Details", "Done"];
  const current = order.indexOf(step);
  return (
    <ol className="flex items-center justify-center gap-2 text-xs text-muted">
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
              i <= current
                ? "border-foreground bg-foreground text-background"
                : "border-line"
            }`}
          >
            {i + 1}
          </span>
          <span className={i === current ? "text-foreground" : ""}>{label}</span>
          {i < labels.length - 1 && (
            <span className="mx-1 h-px w-4 bg-line" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}

function BackRow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={onClick}
        className="text-muted underline underline-offset-4 hover:text-foreground"
      >
        ← Back
      </button>
      <span className="text-muted">·</span>
      <span className="font-medium">{label}</span>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
      />
    </div>
  );
}
