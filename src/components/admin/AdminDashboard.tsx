"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { priceShort } from "@/lib/format";
import { googleCalUrl } from "@/lib/gcal";
import {
  dateKey,
  daysInMonth,
  firstWeekdayMondayFirst,
  formatClock,
  formatDateLabel,
  minutesToHHMM,
  monthLabel,
  toDateStr,
  todayInTz,
  zonedToUtc,
} from "@/lib/time";

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};

type Appointment = {
  id: string;
  serviceName: string;
  durationMinutes: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
  status: string;
  start: string;
  end: string;
};

type DayHours = {
  dayOfWeek: number;
  isClosed: boolean;
  openMinute: number;
  closeMinute: number;
};

type TimeOff = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
};

type Customer = { name: string; email: string; phone: string };

type Data = {
  feedUrl: string;
  services: Service[];
  appointments: Appointment[];
  hours: DayHours[];
  timeOff: TimeOff[];
};

const tz = siteConfig.timezone;
const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAYS_FULL = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "bestätigt",
  PENDING: "offen",
  CANCELLED: "storniert",
  COMPLETED: "erledigt",
};

function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function statusStyle(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-emerald-50 text-emerald-700";
    case "PENDING":
      return "bg-amber-50 text-amber-700";
    case "CANCELLED":
      return "bg-red-50 text-red-700";
    case "COMPLETED":
      return "bg-zinc-100 text-zinc-600";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

export default function AdminDashboard({
  data,
  siteName,
}: {
  data: Data;
  siteName: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"termine" | "verfuegbarkeit">("termine");

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          {siteName} · Admin
        </h1>
        <button
          onClick={logout}
          className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Abmelden
        </button>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-line bg-background p-1 text-sm">
        <button
          onClick={() => setTab("termine")}
          className={`rounded-full px-4 py-1.5 ${
            tab === "termine" ? "bg-foreground text-background" : "text-muted"
          }`}
        >
          Termine
        </button>
        <button
          onClick={() => setTab("verfuegbarkeit")}
          className={`rounded-full px-4 py-1.5 ${
            tab === "verfuegbarkeit"
              ? "bg-foreground text-background"
              : "text-muted"
          }`}
        >
          Verfügbarkeit
        </button>
      </div>

      {tab === "termine" ? (
        <TermineTab
          appointments={data.appointments}
          services={data.services}
          feedUrl={data.feedUrl}
          siteName={siteName}
          onChange={() => router.refresh()}
        />
      ) : (
        <Availability
          hours={data.hours}
          timeOff={data.timeOff}
          onChange={() => router.refresh()}
        />
      )}
    </main>
  );
}

/* ---------------------------------- Termine --------------------------------- */

function TermineTab({
  appointments,
  services,
  feedUrl,
  siteName,
  onChange,
}: {
  appointments: Appointment[];
  services: Service[];
  feedUrl: string;
  siteName: string;
  onChange: () => void;
}) {
  const initial = useMemo(() => {
    const today = todayInTz(tz);
    const [y, m] = today.split("-").map(Number);
    return { year: y, month0: m - 1, today };
  }, []);
  const [year, setYear] = useState(initial.year);
  const [month0, setMonth0] = useState(initial.month0);
  const [selected, setSelected] = useState<string>(initial.today);
  const [showForm, setShowForm] = useState(false);

  // Group appointments by local calendar day.
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = dateKey(new Date(a.start), tz);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [appointments]);

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

  const selectedList = byDay.get(selected) ?? [];

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted">Terminkalender</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
        >
          {showForm ? "Schließen" : "+ Termin einplanen"}
        </button>
      </div>

      {showForm && (
        <ScheduleForm
          services={services}
          defaultDate={selected}
          onDone={() => {
            setShowForm(false);
            onChange();
          }}
        />
      )}

      {/* Calendar */}
      <div className="rounded-2xl border border-line bg-background p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Vorheriger Monat"
            className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-line hover:ring-foreground"
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
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`b${idx}`} />;
            const ds = toDateStr(year, month0, day);
            const list = byDay.get(ds) ?? [];
            const active = list.filter((a) => a.status !== "CANCELLED").length;
            const isToday = ds === initial.today;
            const isSelected = ds === selected;
            return (
              <button
                key={ds}
                onClick={() => setSelected(ds)}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                  isSelected
                    ? "bg-foreground text-background"
                    : isToday
                      ? "bg-surface ring-1 ring-foreground/30"
                      : "hover:bg-surface"
                }`}
              >
                <span className={active ? "font-bold" : "font-medium"}>{day}</span>
                {active > 0 && (
                  <span
                    className={`mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      isSelected
                        ? "bg-background text-foreground"
                        : "bg-emerald-600 text-white"
                    }`}
                  >
                    {active}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day's appointments */}
      <div>
        <h3 className="text-sm font-semibold">
          {formatDateLabel(new Date(`${selected}T12:00:00Z`), "UTC")}
        </h3>
        {selectedList.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Keine Termine an diesem Tag.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {selectedList.map((a) => (
              <AppointmentCard
                key={a.id}
                appt={a}
                siteName={siteName}
                onChange={onChange}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Calendar subscription */}
      {feedUrl && <FeedBox feedUrl={feedUrl} />}
    </div>
  );
}

function AppointmentCard({
  appt: a,
  siteName,
  onChange,
}: {
  appt: Appointment;
  siteName: string;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await fetch(`/api/admin/appointments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const gcal = googleCalUrl({
    title: `${a.serviceName} — ${siteName}`,
    details:
      `Kunde: ${a.customerName}` +
      (a.customerPhone ? ` · ${a.customerPhone}` : "") +
      (a.customerEmail ? ` · ${a.customerEmail}` : ""),
    location: siteConfig.address,
    start: new Date(a.start),
    end: new Date(a.end),
  });

  return (
    <li className="rounded-2xl border border-line bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {formatClock(new Date(a.start), tz)}–{formatClock(new Date(a.end), tz)}
            <span className="ml-2 font-normal text-muted">{a.serviceName}</span>
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle(
                a.status,
              )}`}
            >
              {STATUS_LABEL[a.status] ?? a.status.toLowerCase()}
            </span>
          </p>
          <p className="mt-1 text-sm">
            {a.customerName}
            {a.customerPhone && (
              <>
                {" · "}
                <a className="underline" href={`tel:${a.customerPhone}`}>
                  {a.customerPhone}
                </a>
              </>
            )}
            {a.customerEmail && (
              <>
                {" · "}
                <a className="underline" href={`mailto:${a.customerEmail}`}>
                  {a.customerEmail}
                </a>
              </>
            )}
          </p>
          {a.notes && <p className="mt-1 text-sm text-muted">Notiz: {a.notes}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {a.status !== "CANCELLED" && (
          <button
            disabled={busy}
            onClick={() => setStatus("CANCELLED")}
            className="rounded-lg border border-line px-3 py-1.5 hover:border-red-400 hover:text-red-600 disabled:opacity-50"
          >
            Stornieren
          </button>
        )}
        {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
          <button
            disabled={busy}
            onClick={() => setStatus("COMPLETED")}
            className="rounded-lg border border-line px-3 py-1.5 hover:border-foreground disabled:opacity-50"
          >
            Erledigt
          </button>
        )}
        {a.status === "CANCELLED" && (
          <button
            disabled={busy}
            onClick={() => setStatus("CONFIRMED")}
            className="rounded-lg border border-line px-3 py-1.5 hover:border-foreground disabled:opacity-50"
          >
            Wiederherstellen
          </button>
        )}
        <span className="mx-1 text-line">|</span>
        <a
          href={gcal}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-line px-3 py-1.5 hover:border-foreground"
        >
          Google Kalender
        </a>
        <a
          href={`/api/appointments/${a.id}/ics`}
          className="rounded-lg border border-line px-3 py-1.5 hover:border-foreground"
        >
          .ics
        </a>
      </div>
    </li>
  );
}

function FeedBox({ feedUrl }: { feedUrl: string }) {
  const [copied, setCopied] = useState(false);
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-sm font-semibold">Kalender-Abo (automatische Sync)</h3>
      <p className="mt-1 text-sm text-muted">
        Abonniere diese Adresse einmalig in deinem Kalender (Google/Apple) – neue
        Buchungen erscheinen dann automatisch.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="max-w-full overflow-x-auto rounded-lg border border-line bg-background px-3 py-2 text-xs">
          {feedUrl}
        </code>
        <button
          onClick={copy}
          className="rounded-lg border border-line px-3 py-2 text-xs hover:border-foreground"
        >
          {copied ? "Kopiert ✓" : "Kopieren"}
        </button>
        <a
          href={webcal}
          className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background"
        >
          Abonnieren
        </a>
      </div>
    </div>
  );
}

/* ------------------------------ Schedule form ------------------------------ */

function ScheduleForm({
  services,
  defaultDate,
  onDone,
}: {
  services: Service[];
  defaultDate: string;
  onDone: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("10:00");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing customers once when the form mounts.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCustomers(d.customers ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function pickCustomer(value: string) {
    const c = customers.find((x) => `${x.name}|${x.email}` === value);
    if (c) {
      setName(c.name);
      setEmail(c.email);
      setPhone(c.phone);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceId || !date || !time) return;
    setSubmitting(true);
    setError(null);
    try {
      const start = zonedToUtc(date, hhmmToMinutes(time), tz).toISOString();
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          start,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          notes,
          notify,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Termin konnte nicht angelegt werden.");
        return;
      }
      onDone();
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-line bg-background p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold">Termin einplanen</h3>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Service</span>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {priceShort(s.priceCents)} · {s.durationMinutes} Min.
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Bestehender Kunde</span>
          <select
            defaultValue=""
            onChange={(e) => pickCustomer(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          >
            <option value="">— Neuer Kunde —</option>
            {customers.map((c) => (
              <option key={`${c.name}|${c.email}`} value={`${c.name}|${c.email}`}>
                {c.name}
                {c.email ? ` (${c.email})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Datum</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Uhrzeit</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Telefon (optional)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">E-Mail (optional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">Notiz (optional)</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
        Kunde per E-Mail benachrichtigen (Bestätigung + Kalender)
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
        >
          {submitting ? "Wird angelegt…" : "Termin anlegen"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------ Verfügbarkeit ------------------------------ */

function Availability({
  hours,
  timeOff,
  onChange,
}: {
  hours: DayHours[];
  timeOff: TimeOff[];
  onChange: () => void;
}) {
  const [draft, setDraft] = useState<DayHours[]>(() =>
    DISPLAY_ORDER.map(
      (dow) =>
        hours.find((h) => h.dayOfWeek === dow) ?? {
          dayOfWeek: dow,
          isClosed: true,
          openMinute: 600,
          closeMinute: 1140,
        },
    ),
  );
  const [savingHours, setSavingHours] = useState(false);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [addingOff, setAddingOff] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);

  function updateDay(dow: number, patch: Partial<DayHours>) {
    setDraft((prev) =>
      prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)),
    );
  }

  async function saveHours() {
    setSavingHours(true);
    setHoursMsg(null);
    try {
      const res = await fetch("/api/admin/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: draft }),
      });
      const d = await res.json().catch(() => ({}));
      setHoursMsg(
        res.ok ? "Gespeichert." : d.error ?? "Konnte nicht gespeichert werden.",
      );
      if (res.ok) onChange();
    } finally {
      setSavingHours(false);
    }
  }

  async function addTimeOff(e: React.FormEvent) {
    e.preventDefault();
    setAddingOff(true);
    setOffError(null);
    try {
      const res = await fetch("/api/admin/timeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOffError(d.error ?? "Konnte nicht hinzugefügt werden.");
        return;
      }
      setStart("");
      setEnd("");
      setReason("");
      onChange();
    } finally {
      setAddingOff(false);
    }
  }

  async function removeTimeOff(id: string) {
    await fetch(`/api/admin/timeoff/${id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* Weekly hours */}
      <section className="rounded-2xl border border-line bg-background p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Öffnungszeiten</h2>
        <p className="mt-1 text-xs text-muted">
          Uhrzeiten im 24-Stunden-Format (z. B. 09:00–18:00).
        </p>
        <div className="mt-4 divide-y divide-line">
          {draft.map((d) => (
            <div
              key={d.dayOfWeek}
              className="flex flex-wrap items-center gap-3 py-2.5 text-sm"
            >
              <span className="w-24 font-medium">
                {WEEKDAYS_FULL[d.dayOfWeek]}
              </span>
              <button
                type="button"
                onClick={() => updateDay(d.dayOfWeek, { isClosed: !d.isClosed })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  d.isClosed
                    ? "bg-zinc-100 text-zinc-500"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {d.isClosed ? "Geschlossen" : "Geöffnet"}
              </button>
              {!d.isClosed && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={minutesToHHMM(d.openMinute)}
                    onChange={(e) =>
                      updateDay(d.dayOfWeek, {
                        openMinute: hhmmToMinutes(e.target.value),
                      })
                    }
                    className="rounded-lg border border-line bg-background px-2 py-1"
                  />
                  <span className="text-muted">bis</span>
                  <input
                    type="time"
                    value={minutesToHHMM(d.closeMinute)}
                    onChange={(e) =>
                      updateDay(d.dayOfWeek, {
                        closeMinute: hhmmToMinutes(e.target.value),
                      })
                    }
                    className="rounded-lg border border-line bg-background px-2 py-1"
                  />
                  <span className="text-muted">Uhr</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveHours}
            disabled={savingHours}
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          >
            {savingHours ? "Speichern…" : "Zeiten speichern"}
          </button>
          {hoursMsg && <span className="text-sm text-muted">{hoursMsg}</span>}
        </div>
      </section>

      {/* Time off */}
      <section className="rounded-2xl border border-line bg-background p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Freie Tage / Urlaub</h2>

        {timeOff.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {timeOff.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              >
                <span>
                  {formatDateLabel(new Date(t.startDate), tz)} –{" "}
                  {/* endDate is stored as next-midnight; show the last full day */}
                  {formatDateLabel(new Date(new Date(t.endDate).getTime() - 1), tz)}
                  {t.reason && <span className="text-muted"> · {t.reason}</span>}
                </span>
                <button
                  onClick={() => removeTimeOff(t.id)}
                  className="text-muted underline underline-offset-4 hover:text-red-600"
                >
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={addTimeOff}
          className="mt-4 flex flex-wrap items-end gap-3 text-sm"
        >
          <label className="flex flex-col gap-1">
            <span className="text-muted">Von</span>
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-line bg-background px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Bis</span>
            <input
              type="date"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-lg border border-line bg-background px-2 py-1"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-muted">Grund (optional)</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-line bg-background px-2 py-1"
            />
          </label>
          <button
            type="submit"
            disabled={addingOff}
            className="rounded-xl border border-line px-4 py-2 font-medium hover:border-foreground disabled:opacity-50"
          >
            Hinzufügen
          </button>
        </form>
        {offError && <p className="mt-2 text-sm text-red-600">{offError}</p>}
      </section>
    </div>
  );
}
