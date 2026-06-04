"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { priceShort, priceFull } from "@/lib/format";
import { googleCalUrl } from "@/lib/gcal";
import DatePicker from "./DatePicker";
import {
  addDaysToDateStr,
  dateKey,
  formatClock,
  formatDateLabel,
  longDateFromStr,
  minutesToHHMM,
  todayInTz,
  weekdayOf,
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
  bookingWindowDays: number;
  reminderEnabled: boolean;
  reminderLeadHours: number;
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

// 24h time options in 15-minute steps ("00:00" … "23:45") for German selects.
const TIME_OPTIONS: string[] = Array.from({ length: (24 * 60) / 15 }, (_, i) =>
  minutesToHHMM(i * 15),
);

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
      return "bg-stone-100 text-stone-600";
    default:
      return "bg-stone-100 text-stone-600";
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
  const [tab, setTab] = useState<"termine" | "kunden" | "verfuegbarkeit">(
    "termine",
  );

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          {siteName} <span className="text-brand">· Admin</span>
        </h1>
        <button
          onClick={logout}
          className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Abmelden
        </button>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-line bg-background p-1 text-sm">
        {(
          [
            ["termine", "Termine"],
            ["kunden", "Kunden"],
            ["verfuegbarkeit", "Verfügbarkeit"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              tab === key ? "bg-brand text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "termine" && (
        <TermineTab
          appointments={data.appointments}
          services={data.services}
          hours={data.hours}
          timeOff={data.timeOff}
          feedUrl={data.feedUrl}
          siteName={siteName}
          onChange={() => router.refresh()}
        />
      )}
      {tab === "kunden" && (
        <KundenTab services={data.services} onChange={() => router.refresh()} />
      )}
      {tab === "verfuegbarkeit" && (
        <Availability
          hours={data.hours}
          timeOff={data.timeOff}
          bookingWindowDays={data.bookingWindowDays}
          reminderEnabled={data.reminderEnabled}
          reminderLeadHours={data.reminderLeadHours}
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
  hours,
  timeOff,
  feedUrl,
  siteName,
  onChange,
}: {
  appointments: Appointment[];
  services: Service[];
  hours: DayHours[];
  timeOff: TimeOff[];
  feedUrl: string;
  siteName: string;
  onChange: () => void;
}) {
  const today = useMemo(() => todayInTz(tz), []);
  const [selected, setSelected] = useState<string>(today);
  const [showForm, setShowForm] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = dateKey(new Date(a.start), tz);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [appointments]);

  const closedWeekdays = useMemo(
    () => new Set(hours.filter((h) => h.isClosed).map((h) => h.dayOfWeek)),
    [hours],
  );
  const offRanges = useMemo(
    () =>
      timeOff.map((t) => ({
        start: new Date(t.startDate).getTime(),
        end: new Date(t.endDate).getTime(),
        reason: t.reason,
      })),
    [timeOff],
  );

  function offReason(ds: string): string | null {
    const dayStart = zonedToUtc(ds, 0, tz).getTime();
    const r = offRanges.find((x) => dayStart >= x.start && dayStart < x.end);
    return r ? r.reason || "Gesperrt" : null;
  }
  function isClosedDay(ds: string): boolean {
    return closedWeekdays.has(weekdayOf(ds));
  }

  // The Monday-first week containing the selected day.
  const weekDays = useMemo(() => {
    const offset = (weekdayOf(selected) + 6) % 7;
    const monday = addDaysToDateStr(selected, -offset);
    return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(monday, i));
  }, [selected]);

  const stats = useMemo(() => {
    const active = appointments.filter((a) => a.status !== "CANCELLED");
    const todayCount = (byDay.get(today) ?? []).filter(
      (a) => a.status !== "CANCELLED",
    ).length;
    const weekStart = zonedToUtc(weekDays[0], 0, tz).getTime();
    const weekEnd = weekStart + 7 * 24 * 60 * 60_000;
    const weekCount = active.filter((a) => {
      const t = new Date(a.start).getTime();
      return t >= weekStart && t < weekEnd;
    }).length;
    return { todayCount, weekCount };
  }, [appointments, byDay, today, weekDays]);

  const selectedList = byDay.get(selected) ?? [];
  const selectedOff = offReason(selected);
  const selectedClosed = isClosedDay(selected);

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Heute <span className="font-bold text-brand">{stats.todayCount}</span> ·
          Diese Woche{" "}
          <span className="font-bold text-brand">{stats.weekCount}</span>
        </p>
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

      {/* Day header + week strip */}
      <div className="rounded-2xl border border-line bg-background shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-3 py-3">
          <button
            onClick={() => setSelected(addDaysToDateStr(selected, -7))}
            aria-label="Vorherige Woche"
            className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-line hover:ring-brand"
          >
            ‹
          </button>
          <p className="text-center text-sm font-bold sm:text-base">
            {longDateFromStr(selected)}
          </p>
          <button
            onClick={() => setSelected(addDaysToDateStr(selected, 7))}
            aria-label="Nächste Woche"
            className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-line hover:ring-brand"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 p-2">
          {weekDays.map((ds, i) => {
            const isToday = ds === today;
            const isSel = ds === selected;
            const active = (byDay.get(ds) ?? []).filter(
              (a) => a.status !== "CANCELLED",
            ).length;
            const off = offReason(ds);
            const closed = isClosedDay(ds);
            return (
              <button
                key={ds}
                onClick={() => setSelected(ds)}
                title={
                  off ? `Gesperrt: ${off}` : closed ? "Geschlossen" : undefined
                }
                className="flex flex-col items-center gap-1 rounded-xl py-1.5"
              >
                <span
                  className={`text-[11px] font-semibold ${
                    isToday ? "text-red-500" : isSel ? "text-brand" : "text-muted"
                  }`}
                >
                  {WEEKDAYS_SHORT[i]}
                </span>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    isToday
                      ? "bg-red-500 text-white"
                      : isSel
                        ? "bg-brand text-white"
                        : off
                          ? "bg-brand-soft text-brand-700"
                          : closed
                            ? "text-stone-300"
                            : "hover:bg-surface"
                  }`}
                >
                  {Number(ds.slice(8))}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    active > 0
                      ? isToday
                        ? "bg-red-500"
                        : "bg-brand"
                      : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {(selectedOff || selectedClosed) && (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-700">
          {selectedOff
            ? `Gesperrt${selectedOff !== "Gesperrt" ? ` · ${selectedOff}` : ""} – keine Online-Buchungen.`
            : "Ruhetag (geschlossen) – keine Online-Buchungen."}
        </p>
      )}

      {selectedList.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
          Keine Termine an diesem Tag.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {selectedList.map((a) => (
            <AgendaCard
              key={a.id}
              appt={a}
              siteName={siteName}
              onChange={onChange}
            />
          ))}
        </ul>
      )}

      <div>
        <button
          onClick={() => setSelected(today)}
          className="rounded-full bg-surface px-5 py-2.5 text-sm font-bold ring-1 ring-line hover:ring-brand"
        >
          Heute
        </button>
      </div>

      {feedUrl && <FeedBox feedUrl={feedUrl} />}
    </div>
  );
}

function AgendaCard({
  appt: a,
  siteName,
  onChange,
}: {
  appt: Appointment;
  siteName: string;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelled = a.status === "CANCELLED";
  const bar = cancelled
    ? "bg-stone-300"
    : a.serviceName.toLowerCase().includes("bart")
      ? "bg-blue-900"
      : "bg-brand";

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
    <li className="overflow-hidden rounded-2xl border border-line bg-background shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-stretch text-left"
      >
        <span className={`w-1.5 shrink-0 ${bar}`} aria-hidden />
        <span className="flex flex-1 items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <span
              className={`block font-semibold ${cancelled ? "text-muted line-through" : ""}`}
            >
              {a.serviceName}
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {formatClock(new Date(a.start), tz)} –{" "}
              {formatClock(new Date(a.end), tz)}
            </span>
          </span>
          <span className="shrink-0 text-right text-sm font-semibold">
            {a.customerName}
            {a.status !== "CONFIRMED" && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle(
                  a.status,
                )}`}
              >
                {STATUS_LABEL[a.status] ?? a.status.toLowerCase()}
              </span>
            )}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3 text-sm">
          <p>
            {a.customerPhone && (
              <a className="underline" href={`tel:${a.customerPhone}`}>
                {a.customerPhone}
              </a>
            )}
            {a.customerPhone && a.customerEmail ? " · " : ""}
            {a.customerEmail && (
              <a className="underline" href={`mailto:${a.customerEmail}`}>
                {a.customerEmail}
              </a>
            )}
            {!a.customerPhone && !a.customerEmail && (
              <span className="text-muted">Keine Kontaktdaten</span>
            )}
          </p>
          {a.notes && <p className="mt-1 text-muted">Notiz: {a.notes}</p>}
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
              className="rounded-lg border border-line px-3 py-1.5 hover:border-brand hover:text-brand"
            >
              Google Kalender
            </a>
            <a
              href={`/api/appointments/${a.id}/ics`}
              className="rounded-lg border border-line px-3 py-1.5 hover:border-brand hover:text-brand"
            >
              .ics
            </a>
          </div>
        </div>
      )}
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
          className="rounded-lg border border-line px-3 py-2 text-xs hover:border-brand hover:text-brand"
        >
          {copied ? "Kopiert ✓" : "Kopieren"}
        </button>
        <a
          href={webcal}
          className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Abonnieren
        </a>
      </div>
    </div>
  );
}

/* ----------------------------------- Kunden --------------------------------- */

type CustomerStat = {
  name: string;
  email: string;
  phone: string;
  appointments: number;
  completed: number;
  spentCents: number;
  lastStart: string | null;
};

function KundenTab({
  services,
  onChange,
}: {
  services: Service[];
  onChange: () => void;
}) {
  const [customers, setCustomers] = useState<CustomerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [schedulingFor, setSchedulingFor] = useState<string | null>(null);
  const [newAppt, setNewAppt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCustomers(d.customers ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.toLowerCase().trim();
  const filtered = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      )
    : customers;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Kunden</h2>
        <button
          onClick={() => setNewAppt((v) => !v)}
          aria-label="Neuer Termin"
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg ring-1 ring-line hover:ring-brand"
        >
          +
        </button>
      </div>

      {newAppt && (
        <div className="rounded-2xl border border-brand/30 bg-brand-soft/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Neuer Termin</p>
            <button
              onClick={() => setNewAppt(false)}
              className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
            >
              Abbrechen
            </button>
          </div>
          <ScheduleForm
            services={services}
            defaultDate={todayInTz(tz)}
            onDone={() => {
              setNewAppt(false);
              onChange();
            }}
          />
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Suche Name, E-Mail…"
        className="w-full rounded-full border border-line bg-surface px-5 py-2.5 text-sm outline-none focus:border-brand"
      />

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg bg-surface px-3 py-3 text-sm text-muted">
          {query ? "Keine Treffer." : "Noch keine Kunden – sobald jemand bucht, erscheint er hier."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-background">
          {filtered.map((c, idx) => {
            const key = `${c.name}|${c.email}`;
            const isOpen = expanded === key;
            return (
              <li key={key} className={idx > 0 ? "border-t border-line" : ""}>
                <button
                  onClick={() => {
                    setExpanded(isOpen ? null : key);
                    setSchedulingFor(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-600">
                    {(c.name.trim()[0] || "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{c.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {c.email || c.phone || "—"}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-brand-soft px-2.5 py-1 font-medium text-brand-700">
                        {c.appointments} Termine
                      </span>
                      <span className="rounded-full bg-surface px-2.5 py-1 text-muted">
                        {c.completed} wahrgenommen
                      </span>
                      <span className="rounded-full bg-surface px-2.5 py-1 text-muted">
                        {priceFull(c.spentCents)} ausgegeben
                      </span>
                      {c.lastStart && (
                        <span className="rounded-full bg-surface px-2.5 py-1 text-muted">
                          zuletzt {formatDateLabel(new Date(c.lastStart), tz)}
                        </span>
                      )}
                    </div>
                    {(c.phone || c.email) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        {c.phone && (
                          <a className="underline" href={`tel:${c.phone}`}>
                            {c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a className="underline" href={`mailto:${c.email}`}>
                            {c.email}
                          </a>
                        )}
                      </div>
                    )}
                    {schedulingFor === key ? (
                      <div className="mt-3">
                        <ScheduleForm
                          key={key}
                          services={services}
                          defaultDate={todayInTz(tz)}
                          prefill={{ name: c.name, email: c.email, phone: c.phone }}
                          onDone={() => {
                            setSchedulingFor(null);
                            onChange();
                          }}
                        />
                        <button
                          onClick={() => setSchedulingFor(null)}
                          className="mt-2 text-sm text-muted underline underline-offset-4 hover:text-foreground"
                        >
                          Abbrechen
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSchedulingFor(key)}
                        className="mt-3 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
                      >
                        + Termin eintragen
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ Schedule form ------------------------------ */

function ScheduleForm({
  services,
  defaultDate,
  prefill,
  onDone,
}: {
  services: Service[];
  defaultDate: string;
  prefill?: { name: string; email: string; phone: string };
  onDone: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("10:00");
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Datum</span>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Uhrzeit</span>
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2 tabular-nums"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t} Uhr
              </option>
            ))}
          </select>
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

      <div className="mt-4">
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
  bookingWindowDays,
  reminderEnabled,
  reminderLeadHours,
  onChange,
}: {
  hours: DayHours[];
  timeOff: TimeOff[];
  bookingWindowDays: number;
  reminderEnabled: boolean;
  reminderLeadHours: number;
  onChange: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col gap-8">
      <BookingWindowCard days={bookingWindowDays} onChange={onChange} />
      <RemindersCard
        enabled={reminderEnabled}
        leadHours={reminderLeadHours}
        onChange={onChange}
      />
      <HoursCard hours={hours} onChange={onChange} />
      <TimeOffCard timeOff={timeOff} onChange={onChange} />
    </div>
  );
}

function BookingWindowCard({
  days: initialDays,
  onChange,
}: {
  days: number;
  onChange: () => void;
}) {
  const [days, setDays] = useState(initialDays);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingWindowDays: days }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Gespeichert." : d.error ?? "Fehler.");
      if (res.ok) onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Buchungszeitraum</h2>
      <p className="mt-1 text-xs text-muted">
        Wie viele Tage im Voraus Kunden online buchen können.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-20 rounded-lg border border-line bg-background px-3 py-2"
        />
        <span className="text-muted">Tage im Voraus</span>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
        >
          {saving ? "Speichern…" : "Speichern"}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </section>
  );
}

function RemindersCard({
  enabled: initialEnabled,
  leadHours: initialLead,
  onChange,
}: {
  enabled: boolean;
  leadHours: number;
  onChange: () => void;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [lead, setLead] = useState(initialLead);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const LEAD_OPTIONS = [
    { v: 2, label: "2 Stunden vorher" },
    { v: 6, label: "6 Stunden vorher" },
    { v: 12, label: "12 Stunden vorher" },
    { v: 24, label: "1 Tag vorher" },
    { v: 48, label: "2 Tage vorher" },
  ];

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminderEnabled: enabled,
          reminderLeadHours: lead,
        }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Gespeichert." : d.error ?? "Fehler.");
      if (res.ok) onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Erinnerungen</h2>
      <p className="mt-1 text-xs text-muted">
        Automatische Erinnerungs-E-Mail an Kunden vor dem Termin.
      </p>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Erinnerungen senden
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Zeitpunkt:</span>
          <select
            value={lead}
            disabled={!enabled}
            onChange={(e) => setLead(Number(e.target.value))}
            className="rounded-lg border border-line bg-background px-3 py-2 disabled:opacity-40"
          >
            {LEAD_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      </div>
    </section>
  );
}

function HoursCard({
  hours,
  onChange,
}: {
  hours: DayHours[];
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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function updateDay(dow: number, patch: Partial<DayHours>) {
    setDraft((prev) =>
      prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)),
    );
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: draft }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Gespeichert." : d.error ?? "Fehler.");
      if (res.ok) onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
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
            <span className="w-24 font-medium">{WEEKDAYS_FULL[d.dayOfWeek]}</span>
            <button
              type="button"
              onClick={() => updateDay(d.dayOfWeek, { isClosed: !d.isClosed })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                d.isClosed
                  ? "bg-stone-100 text-stone-500"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {d.isClosed ? "Geschlossen" : "Geöffnet"}
            </button>
            {!d.isClosed && (
              <div className="flex items-center gap-2">
                <select
                  value={minutesToHHMM(d.openMinute)}
                  onChange={(e) =>
                    updateDay(d.dayOfWeek, {
                      openMinute: hhmmToMinutes(e.target.value),
                    })
                  }
                  className="rounded-lg border border-line bg-background px-2 py-1 tabular-nums"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="text-muted">bis</span>
                <select
                  value={minutesToHHMM(d.closeMinute)}
                  onChange={(e) =>
                    updateDay(d.dayOfWeek, {
                      closeMinute: hhmmToMinutes(e.target.value),
                    })
                  }
                  className="rounded-lg border border-line bg-background px-2 py-1 tabular-nums"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="text-muted">Uhr</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
        >
          {saving ? "Speichern…" : "Zeiten speichern"}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </section>
  );
}

function TimeOffCard({
  timeOff,
  onChange,
}: {
  timeOff: TimeOff[];
  onChange: () => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [rangeMode, setRangeMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setStart("");
    setEnd("");
    setReason("");
    setRangeMode(false);
    setEditingId(null);
    setError(null);
  }

  function startEdit(t: TimeOff) {
    const s = dateKey(new Date(t.startDate), tz);
    // stored end is next-midnight; show the last full day
    const e = dateKey(new Date(new Date(t.endDate).getTime() - 1), tz);
    setEditingId(t.id);
    setStart(s);
    setEnd(e);
    setRangeMode(s !== e);
    setReason(t.reason);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start) {
      setError("Bitte ein Datum wählen.");
      return;
    }
    const finalEnd = rangeMode && end ? end : start;
    if (finalEnd < start) {
      setError("Bis-Datum muss am/nach dem Von-Datum liegen.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/admin/timeoff/${editingId}`
        : "/api/admin/timeoff";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: finalEnd, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Konnte nicht gespeichert werden.");
        return;
      }
      resetForm();
      onChange();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/timeoff/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    onChange();
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Freie Tage / Urlaub</h2>
      <p className="mt-1 text-xs text-muted">
        Sperre einen einzelnen Tag (nur „Von") oder einen Zeitraum. An gesperrten
        Tagen sind keine Buchungen möglich.
      </p>

      {timeOff.length === 0 ? (
        <p className="mt-4 rounded-lg bg-surface px-3 py-3 text-sm text-muted">
          Noch keine freien Tage eingetragen.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {timeOff.map((t) => {
            const fromLabel = formatDateLabel(new Date(t.startDate), tz);
            const toLabel = formatDateLabel(
              new Date(new Date(t.endDate).getTime() - 1),
              tz,
            );
            const isEditing = editingId === t.id;
            return (
              <li
                key={t.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  isEditing
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-surface"
                }`}
              >
                <span>
                  {fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`}
                  {t.reason && <span className="text-muted"> · {t.reason}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <button
                    onClick={() => startEdit(t)}
                    className="text-muted underline underline-offset-4 hover:text-brand"
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="text-muted underline underline-offset-4 hover:text-red-600"
                  >
                    Entfernen
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={submit} className="mt-4 grid gap-3">
        <p className="text-xs font-semibold text-muted">
          {editingId ? "Eintrag bearbeiten" : "Tag oder Zeitraum sperren"}
        </p>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{rangeMode ? "Von" : "Datum"}</span>
          <div className="max-w-[14rem]">
            <DatePicker value={start} onChange={setStart} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={rangeMode}
            onChange={(e) => {
              setRangeMode(e.target.checked);
              if (!e.target.checked) setEnd("");
            }}
          />
          Mehrere Tage (Zeitraum)
        </label>
        {rangeMode && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Bis</span>
            <div className="max-w-[14rem]">
              <DatePicker value={end} onChange={setEnd} />
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Grund (optional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="z. B. Urlaub"
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>
        {error && (
          <p className="text-sm text-red-600 sm:col-span-2">{error}</p>
        )}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
          >
            {saving
              ? "Speichern…"
              : editingId
                ? "Änderungen speichern"
                : "Zeitraum sperren"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
            >
              Abbrechen
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
