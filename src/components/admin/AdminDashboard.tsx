"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { priceShort, priceFull } from "@/lib/format";
import { googleCalUrl } from "@/lib/gcal";
import { SLOT_INTERVAL_MINUTES } from "@/lib/constants";
import type { RevenueStats } from "@/lib/revenue";
import DatePicker from "./DatePicker";
import {
  addDaysToDateStr,
  dateKey,
  formatClock,
  formatDateLabel,
  longDateFromStr,
  minutesToHHMM,
  nowMs,
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

type SpecialDay = {
  id: string;
  date: string;
  openMinute: number;
  closeMinute: number;
  isPublic: boolean;
  note: string;
};

type Customer = { name: string; email: string; phone: string };

type WaitlistItem = {
  id: string;
  serviceName: string;
  date: string;
  customerName: string;
  customerEmail: string;
  notifiedAt: string | null;
};

type Data = {
  feedUrl: string;
  bookingWindowDays: number;
  reminderEnabled: boolean;
  reminderLeadHours: number;
  revenue: RevenueStats;
  services: Service[];
  appointments: Appointment[];
  hours: DayHours[];
  timeOff: TimeOff[];
  specialDays: SpecialDay[];
  waitlist: WaitlistItem[];
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
  NO_SHOW: "nicht erschienen",
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
    case "NO_SHOW":
      return "bg-orange-50 text-orange-700";
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
  const [tab, setTab] = useState<
    "termine" | "kunden" | "umsatz" | "services" | "verfuegbarkeit"
  >("termine");

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 animate-fade-in px-5 py-10">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            className="h-8 w-8 rounded-full object-cover ring-1 ring-line"
          />
          {siteName} <span className="text-brand">· Admin</span>
        </h1>
        <button
          onClick={logout}
          className="text-sm text-muted underline underline-offset-4 transition-colors hover:text-foreground"
        >
          Abmelden
        </button>
      </div>

      <div className="mt-6 inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-background p-1 text-sm shadow-soft">
        {(
          [
            ["termine", "Termine"],
            ["kunden", "Kunden"],
            ["umsatz", "Umsatz"],
            ["services", "Services"],
            ["verfuegbarkeit", "Verfügbarkeit"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 transition-all duration-300 ${
              tab === key
                ? "bg-brand text-white shadow-[var(--shadow-brand)]"
                : "text-muted hover:bg-brand-soft hover:text-foreground"
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
          specialDays={data.specialDays}
          waitlist={data.waitlist}
          feedUrl={data.feedUrl}
          siteName={siteName}
          onChange={() => router.refresh()}
        />
      )}
      {tab === "kunden" && (
        <KundenTab services={data.services} onChange={() => router.refresh()} />
      )}
      {tab === "umsatz" && <UmsatzTab revenue={data.revenue} />}
      {tab === "services" && <ServicesTab onChange={() => router.refresh()} />}
      {tab === "verfuegbarkeit" && (
        <Availability
          hours={data.hours}
          timeOff={data.timeOff}
          specialDays={data.specialDays}
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

// Premium stat card used across the dashboard.
function StatCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card-lift rounded-2xl border border-line bg-background px-5 py-4 shadow-soft">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {icon}
          </svg>
        </span>
        {label}
      </div>
      <p className="mt-2 font-display text-3xl font-bold leading-none text-foreground">
        {value}
      </p>
      {unit && <p className="mt-1 text-xs text-muted">{unit}</p>}
    </div>
  );
}

function TermineTab({
  appointments,
  services,
  hours,
  timeOff,
  specialDays,
  waitlist,
  feedUrl,
  siteName,
  onChange,
}: {
  appointments: Appointment[];
  services: Service[];
  hours: DayHours[];
  timeOff: TimeOff[];
  specialDays: SpecialDay[];
  waitlist: WaitlistItem[];
  feedUrl: string;
  siteName: string;
  onChange: () => void;
}) {
  const today = useMemo(() => todayInTz(tz), []);
  const [selected, setSelected] = useState<string>(today);
  const [showForm, setShowForm] = useState(false);
  // When "Besetzen" is chosen for a specific free slot, prefill the form's time.
  const [formTime, setFormTime] = useState<string | undefined>(undefined);

  const waitlistByDay = useMemo(() => {
    const map = new Map<string, WaitlistItem[]>();
    for (const w of waitlist) {
      const key = dateKey(new Date(w.date), tz);
      const list = map.get(key) ?? [];
      list.push(w);
      map.set(key, list);
    }
    return map;
  }, [waitlist]);

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

  const specialByDay = useMemo(() => {
    const map = new Map<string, SpecialDay>();
    for (const s of specialDays) map.set(dateKey(new Date(s.date), tz), s);
    return map;
  }, [specialDays]);

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
    const active = appointments.filter(
      (a) => a.status !== "CANCELLED" && a.status !== "BLOCKED",
    );
    const todayCount = (byDay.get(today) ?? []).filter(
      (a) => a.status !== "CANCELLED" && a.status !== "BLOCKED",
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
  const selectedSpecial = specialByDay.get(selected) ?? null;
  const selectedWaitlist = waitlistByDay.get(selected) ?? [];
  // Real bookings shown in the agenda list (manual blocks live in the slot grid).
  const realAppts = selectedList.filter((a) => a.status !== "BLOCKED");
  const dayOpen = !selectedOff && (selectedSpecial !== null || !selectedClosed);

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-stretch justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-sm">
          <StatCard
            label="Heute"
            value={stats.todayCount}
            unit="Termine"
            icon={
              <>
                <rect x="3" y="4" width="18" height="17" rx="3" strokeWidth="2" />
                <path d="M3 9h18M8 2v4M16 2v4" strokeWidth="2" strokeLinecap="round" />
              </>
            }
          />
          <StatCard
            label="Diese Woche"
            value={stats.weekCount}
            unit="Termine"
            icon={
              <>
                <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </>
            }
          />
        </div>
        <button
          onClick={() => {
            setFormTime(undefined);
            setShowForm((v) => !v);
          }}
          className="btn-shine self-end rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-brand)] transition-transform hover:scale-[1.03]"
        >
          {showForm ? "Schließen" : "+ Termin einplanen"}
        </button>
      </div>

      {showForm && (
        <ScheduleForm
          key={formTime ?? "manual"}
          services={services}
          defaultDate={selected}
          defaultTime={formTime}
          onDone={() => {
            setShowForm(false);
            setFormTime(undefined);
            onChange();
          }}
        />
      )}

      {/* Day header + week strip */}
      <div className="rounded-2xl border border-line bg-background shadow-soft">
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
              (a) => a.status !== "CANCELLED" && a.status !== "BLOCKED",
            ).length;
            const off = offReason(ds);
            const special = specialByDay.get(ds) ?? null;
            const wl = (waitlistByDay.get(ds) ?? []).length;
            // An extra working day overrides the "closed" look.
            const closed = isClosedDay(ds) && !special;
            return (
              <button
                key={ds}
                onClick={() => setSelected(ds)}
                title={
                  off
                    ? `Gesperrt: ${off}`
                    : special
                      ? `Extra-Arbeitstag${special.isPublic ? " (öffentlich)" : " (intern)"}`
                      : closed
                        ? "Geschlossen"
                        : undefined
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
                          : special
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : closed
                              ? "text-stone-300"
                              : "hover:bg-surface"
                  }`}
                >
                  {Number(ds.slice(8))}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      active > 0
                        ? isToday
                          ? "bg-red-500"
                          : "bg-brand"
                        : special
                          ? "bg-emerald-400"
                          : "bg-transparent"
                    }`}
                  />
                  {wl > 0 && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      title={`${wl} auf Warteliste`}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedSpecial && !selectedOff && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Extra-Arbeitstag · {minutesToHHMM(selectedSpecial.openMinute)}–
          {minutesToHHMM(selectedSpecial.closeMinute)} Uhr ·{" "}
          {selectedSpecial.isPublic
            ? "öffentlich buchbar"
            : "nur für mich (nicht online buchbar)"}
          {selectedSpecial.note ? ` · ${selectedSpecial.note}` : ""}
        </p>
      )}

      {(selectedOff || (selectedClosed && !selectedSpecial)) && (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-700">
          {selectedOff
            ? `Gesperrt${selectedOff !== "Gesperrt" ? ` · ${selectedOff}` : ""} – keine Online-Buchungen.`
            : "Ruhetag (geschlossen) – keine Online-Buchungen."}
        </p>
      )}

      {dayOpen && (
        <DaySlots
          date={selected}
          hours={hours}
          special={selectedSpecial}
          appointments={selectedList}
          onChange={onChange}
          onBesetzen={(hhmm) => {
            setFormTime(hhmm);
            setShowForm(true);
          }}
        />
      )}

      {realAppts.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
          Keine Termine an diesem Tag.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {realAppts.map((a) => (
            <AgendaCard
              key={a.id}
              appt={a}
              siteName={siteName}
              onChange={onChange}
            />
          ))}
        </ul>
      )}

      {selectedWaitlist.length > 0 && (
        <WaitlistPanel
          entries={selectedWaitlist}
          date={selected}
          onChange={onChange}
        />
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

// Waitlist entries for the selected day, with notify + remove actions.
function WaitlistPanel({
  entries,
  date,
  onChange,
}: {
  entries: WaitlistItem[];
  date: string;
  onChange: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pending = entries.filter((e) => !e.notifiedAt).length;

  async function notify(id: string) {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/waitlist/${id}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Konnte nicht senden." });
      }
      onChange();
    } finally {
      setBusyId(null);
    }
  }
  async function notifyAll() {
    setBulkBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/waitlist/notify-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({
          ok: data.failed === 0,
          text:
            `${data.sent} benachrichtigt` +
            (data.failed ? `, ${data.failed} fehlgeschlagen (Resend-Domain prüfen)` : ""),
        });
      } else {
        setMsg({ ok: false, text: data.error ?? "Konnte nicht senden." });
      }
      onChange();
    } finally {
      setBulkBusy(false);
    }
  }
  async function remove(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/waitlist/${id}`, { method: "DELETE" });
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <path d="M12 7v5l3 2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3 className="text-sm font-bold">
            Warteliste <span className="text-muted">({entries.length})</span>
          </h3>
        </div>
        {pending > 0 && (
          <button
            disabled={bulkBusy}
            onClick={notifyAll}
            className="btn-shine rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-[var(--shadow-brand)] transition-transform hover:scale-[1.03] disabled:opacity-50"
          >
            {bulkBusy ? "Wird gesendet…" : `Alle benachrichtigen (${pending})`}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Wird ein Termin frei: „Alle benachrichtigen“ mailt allen Wartenden des
        Tages gleichzeitig.
      </p>
      {msg && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-2.5">
        {entries.map((w) => (
          <li
            key={w.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {w.customerName}
                <span className="ml-2 font-normal text-muted">{w.serviceName}</span>
              </p>
              <a
                href={`mailto:${w.customerEmail}`}
                className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
              >
                {w.customerEmail}
              </a>
            </div>
            <div className="flex items-center gap-2">
              {w.notifiedAt ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                  benachrichtigt
                </span>
              ) : (
                <button
                  disabled={busyId === w.id}
                  onClick={() => notify(w.id)}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-50"
                >
                  Benachrichtigen
                </button>
              )}
              <button
                disabled={busyId === w.id}
                onClick={() => remove(w.id)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-red-400 hover:text-red-600 disabled:opacity-50"
              >
                Entfernen
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Grid of the selected day's 30-minute slots. Free slots can be tapped to
// choose "Sperren" (manual block — no customer, no revenue) or "Besetzen" (open
// the manual-booking form prefilled with that time). Blocked slots can be freed.
function DaySlots({
  date,
  hours,
  special,
  appointments,
  onChange,
  onBesetzen,
}: {
  date: string;
  hours: DayHours[];
  special: SpecialDay | null;
  appointments: Appointment[];
  onChange: () => void;
  onBesetzen: (hhmm: string) => void;
}) {
  const [sel, setSel] = useState<{
    hhmm: string;
    kind: "free" | "blocked";
    apptId?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const dayHours = hours.find((h) => h.dayOfWeek === weekdayOf(date));
  const openMin = special ? special.openMinute : (dayHours?.openMinute ?? 0);
  const closeMin = special ? special.closeMinute : (dayHours?.closeMinute ?? 0);

  type SlotCell = {
    hhmm: string;
    startMs: number;
    state: "free" | "blocked" | "booked";
    apptId?: string;
    label?: string;
  };
  const cells: SlotCell[] = [];
  for (
    let m = openMin;
    m + SLOT_INTERVAL_MINUTES <= closeMin;
    m += SLOT_INTERVAL_MINUTES
  ) {
    const start = zonedToUtc(date, m, tz);
    const endMs = start.getTime() + SLOT_INTERVAL_MINUTES * 60_000;
    const startMs = start.getTime();
    const appt = appointments.find(
      (a) =>
        a.status !== "CANCELLED" &&
        a.status !== "NO_SHOW" &&
        new Date(a.start).getTime() < endMs &&
        new Date(a.end).getTime() > startMs,
    );
    const hhmm = minutesToHHMM(m);
    if (!appt) cells.push({ hhmm, startMs, state: "free" });
    else if (appt.status === "BLOCKED")
      cells.push({ hhmm, startMs, state: "blocked", apptId: appt.id });
    else cells.push({ hhmm, startMs, state: "booked", label: appt.customerName });
  }

  if (cells.length === 0) return null;

  async function block(hhmm: string) {
    setBusy(true);
    try {
      const start = zonedToUtc(date, hhmmToMinutes(hhmm), tz).toISOString();
      await fetch("/api/admin/appointments/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start }),
      });
      setSel(null);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function freeBlock(apptId: string) {
    setBusy(true);
    try {
      await fetch(`/api/admin/appointments/${apptId}`, { method: "DELETE" });
      setSel(null);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const nowVal = nowMs();

  return (
    <div className="rounded-2xl border border-line bg-background p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted">
          Freie Zeiten verwalten
        </h3>
        <span className="hidden text-xs text-muted sm:block">
          Antippen: sperren oder besetzen
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {cells.map((c) => {
          const past = c.startMs < nowVal;
          const isSel = sel?.hhmm === c.hhmm;
          if (c.state === "booked") {
            return (
              <div
                key={c.hhmm}
                title={c.label}
                className="rounded-xl bg-surface px-2 py-2 text-center ring-1 ring-line"
              >
                <span className="block text-xs font-semibold tabular-nums text-muted">
                  {c.hhmm}
                </span>
                <span className="block truncate text-[10px] text-muted">
                  {c.label}
                </span>
              </div>
            );
          }
          if (c.state === "blocked") {
            return (
              <button
                key={c.hhmm}
                onClick={() =>
                  setSel(
                    isSel
                      ? null
                      : { hhmm: c.hhmm, kind: "blocked", apptId: c.apptId },
                  )
                }
                className={`rounded-xl px-2 py-2 text-center text-xs ring-1 transition-colors ${
                  isSel
                    ? "bg-stone-700 text-white ring-stone-700"
                    : "bg-stone-100 text-stone-500 ring-stone-200 hover:ring-stone-400"
                }`}
              >
                <span className="block font-semibold tabular-nums">
                  {c.hhmm}
                </span>
                <span className="block text-[10px]">Gesperrt</span>
              </button>
            );
          }
          return (
            <button
              key={c.hhmm}
              disabled={past}
              onClick={() =>
                setSel(isSel ? null : { hhmm: c.hhmm, kind: "free" })
              }
              className={`rounded-xl px-2 py-3 text-center text-sm font-semibold tabular-nums ring-1 transition-colors ${
                past
                  ? "cursor-not-allowed bg-background text-stone-300 ring-line"
                  : isSel
                    ? "bg-brand text-white ring-brand"
                    : "bg-background text-foreground ring-line hover:ring-brand"
              }`}
            >
              {c.hhmm}
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm">
          <span className="font-semibold tabular-nums">{sel.hhmm} Uhr</span>
          {sel.kind === "free" ? (
            <>
              <button
                disabled={busy}
                onClick={() => block(sel.hhmm)}
                className="rounded-lg bg-stone-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
              >
                🔒 Sperren
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  onBesetzen(sel.hhmm);
                  setSel(null);
                }}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                👤 Besetzen
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => sel.apptId && freeBlock(sel.apptId)}
              className="rounded-lg border border-line bg-background px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand disabled:opacity-50"
            >
              Freigeben
            </button>
          )}
          <button
            onClick={() => setSel(null)}
            className="ml-auto rounded-lg px-2 py-1 text-xs text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
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
  const noShow = a.status === "NO_SHOW";
  const isPast = new Date(a.start).getTime() < nowMs();
  const bar = cancelled
    ? "bg-stone-300"
    : noShow
      ? "bg-orange-400"
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
    start: new Date(a.start),
    end: new Date(a.end),
  });

  return (
    <li className="card-lift overflow-hidden rounded-2xl border border-line bg-background shadow-soft">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-stretch text-left"
      >
        <span className={`w-2 shrink-0 ${bar}`} aria-hidden />
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
            {isPast && !cancelled && !noShow && (
              <button
                disabled={busy}
                onClick={() => setStatus("NO_SHOW")}
                className="rounded-lg border border-line px-3 py-1.5 hover:border-orange-400 hover:text-orange-600 disabled:opacity-50"
              >
                Nicht erschienen
              </button>
            )}
            {(a.status === "CANCELLED" || noShow) && (
              <button
                disabled={busy}
                onClick={() => setStatus("CONFIRMED")}
                className="rounded-lg border border-line px-3 py-1.5 hover:border-foreground disabled:opacity-50"
              >
                {noShow ? "Doch erschienen" : "Wiederherstellen"}
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
              Apple Kalender
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

/* ----------------------------------- Umsatz --------------------------------- */

function UmsatzTab({ revenue }: { revenue: RevenueStats }) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-xs text-muted">
        Umsatz aus wahrgenommenen Terminen (alle vergangenen, nicht stornierten).
      </p>
      <div className="grid grid-cols-3 gap-3">
        <RevenueStat label="Diese Woche" value={priceFull(revenue.thisWeekCents)} />
        <RevenueStat
          label="Dieser Monat"
          value={priceFull(revenue.thisMonthCents)}
        />
        <RevenueStat label="Gesamt" value={priceFull(revenue.totalCents)} />
      </div>
      <BarChart title="Pro Woche" data={revenue.weeks} />
      <BarChart title="Pro Monat" data={revenue.months} />

      <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">
          No-Shows (nicht erschienen)
        </p>
        <p className="mt-1 text-xl font-bold text-orange-700">
          {revenue.noShowCount}{" "}
          <span className="text-sm font-medium text-orange-600">
            {revenue.noShowCount === 1 ? "Termin" : "Termine"}
          </span>
        </p>
        <p className="mt-1 text-xs text-orange-700/80">
          Entgangener Umsatz: {priceFull(revenue.noShowCents)}. Markiere einen
          vergangenen Termin als „Nicht erschienen“, damit er hier zählt.
        </p>
      </div>
    </div>
  );
}

function RevenueStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-background p-4 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-brand">{value}</p>
    </div>
  );
}

function BarChart({
  title,
  data,
}: {
  title: string;
  data: { label: string; cents: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.cents));
  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-4 flex items-end gap-2" style={{ height: "170px" }}>
        {data.map((d, i) => {
          const h = d.cents > 0 ? Math.max(6, Math.round((d.cents / max) * 130)) : 2;
          return (
            <div
              key={i}
              className="flex flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-[10px] font-semibold text-foreground">
                {d.cents > 0 ? priceShort(d.cents) : ""}
              </span>
              <div
                className="w-full rounded-t-md bg-brand"
                style={{ height: `${h}px` }}
                title={priceFull(d.cents)}
              />
              <span className="text-[10px] text-muted">{d.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------- Services -------------------------------- */

type ManagedService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  sortOrder: number;
};

// "1500" cents -> "15,00"; tolerant parser back to cents ("15", "15,5", "15,50").
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
function inputToCents(value: string): number | null {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function ServicesTab({ onChange }: { onChange: () => void }) {
  const [services, setServices] = useState<ManagedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useMemo(
    () => () => {
      setLoading(true);
      fetch("/api/admin/services")
        .then((r) => r.json())
        .then((d) => setServices(d.services ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    // Intentional one-shot data load on mount; the synchronous setState is the
    // standard fetch-on-mount pattern and does not cause problematic cascades.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function refresh() {
    load();
    onChange(); // booking form / scheduler use the active service list
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Services</h2>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setEditing(null);
          }}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
        >
          {adding ? "Schließen" : "+ Neuer Service"}
        </button>
      </div>

      {adding && (
        <ServiceForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {loading ? (
        <p className="text-sm text-muted">Lädt…</p>
      ) : services.length === 0 ? (
        <p className="rounded-lg bg-surface px-3 py-3 text-sm text-muted">
          Noch keine Services. Lege oben den ersten an.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {services.map((s) => (
            <li
              key={s.id}
              className="overflow-hidden rounded-2xl border border-line bg-background shadow-soft"
            >
              {editing === s.id ? (
                <div className="p-4">
                  <ServiceForm
                    service={s}
                    onCancel={() => setEditing(null)}
                    onSaved={() => {
                      setEditing(null);
                      refresh();
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className={s.active ? "" : "text-muted line-through"}>
                        {s.name}
                      </span>
                      {!s.active && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                          inaktiv
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {priceFull(s.priceCents)} · {s.durationMinutes} Min.
                      {s.description ? ` · ${s.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <button
                      onClick={() => {
                        setEditing(s.id);
                        setAdding(false);
                      }}
                      className="rounded-lg border border-line px-3 py-1.5 hover:border-brand hover:text-brand"
                    >
                      Bearbeiten
                    </button>
                    <ServiceRowActions service={s} onChanged={refresh} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Services mit bestehenden Terminen werden beim Löschen nur deaktiviert
        (für die Historie), sonst vollständig entfernt.
      </p>
    </div>
  );
}

function ServiceRowActions({
  service: s,
  onChanged,
}: {
  service: ManagedService;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    try {
      await fetch(`/api/admin/services/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !s.active }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        `„${s.name}" wirklich löschen? Bei bestehenden Terminen wird er stattdessen deaktiviert.`,
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/admin/services/${s.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        disabled={busy}
        onClick={toggleActive}
        className="rounded-lg border border-line px-3 py-1.5 hover:border-foreground disabled:opacity-50"
      >
        {s.active ? "Deaktivieren" : "Aktivieren"}
      </button>
      <button
        disabled={busy}
        onClick={remove}
        className="rounded-lg border border-line px-3 py-1.5 hover:border-red-400 hover:text-red-600 disabled:opacity-50"
      >
        Löschen
      </button>
    </>
  );
}

function ServiceForm({
  service,
  onCancel,
  onSaved,
}: {
  service?: ManagedService;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [price, setPrice] = useState(
    service ? centsToInput(service.priceCents) : "",
  );
  const [duration, setDuration] = useState(
    service ? String(service.durationMinutes) : "30",
  );
  const [description, setDescription] = useState(service?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = inputToCents(price);
    const mins = parseInt(duration, 10);
    if (!name.trim()) return setError("Name ist erforderlich.");
    if (cents === null) return setError("Ungültiger Preis.");
    if (!Number.isFinite(mins) || mins < 5)
      return setError("Dauer muss mind. 5 Minuten sein.");

    setSaving(true);
    try {
      const url = service
        ? `/api/admin/services/${service.id}`
        : "/api/admin/services";
      const res = await fetch(url, {
        method: service ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          priceCents: cents,
          durationMinutes: mins,
          description: description.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={
        service
          ? ""
          : "rounded-2xl border border-line bg-background p-5 shadow-soft"
      }
    >
      {!service && <h3 className="text-sm font-semibold">Neuer Service</h3>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Haarschnitt"
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Preis (€)</span>
          <input
            type="text"
            inputMode="decimal"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="15,00"
            className="rounded-lg border border-line bg-background px-3 py-2 tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Dauer (Min.)</span>
          <input
            type="number"
            min={5}
            step={5}
            required
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2 tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">Beschreibung (optional)</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
        >
          {saving ? "Speichert…" : service ? "Speichern" : "Service anlegen"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------- Kunden --------------------------------- */

type CustomerStat = {
  name: string;
  email: string;
  phone: string;
  appointments: number;
  completed: number;
  noShows: number;
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
    // Intentional one-shot data load on mount (see note above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
                      {c.noShows > 0 && (
                        <span className="rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-700">
                          {c.noShows} nicht erschienen
                        </span>
                      )}
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
  defaultTime,
  prefill,
  onDone,
}: {
  services: Service[];
  defaultDate: string;
  defaultTime?: string;
  prefill?: { name: string; email: string; phone: string };
  onDone: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime ?? "10:00");
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
      className="rounded-2xl border border-line bg-background p-5 shadow-soft"
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
  specialDays,
  bookingWindowDays,
  reminderEnabled,
  reminderLeadHours,
  onChange,
}: {
  hours: DayHours[];
  timeOff: TimeOff[];
  specialDays: SpecialDay[];
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
      <SpecialDaysCard specialDays={specialDays} onChange={onChange} />
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
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
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
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
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
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
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
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <h2 className="text-sm font-semibold">Freie Tage / Urlaub</h2>
      <p className="mt-1 text-xs text-muted">
        Sperre einen einzelnen Tag (nur „Von“) oder einen Zeitraum. An gesperrten
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

function SpecialDaysCard({
  specialDays,
  onChange,
}: {
  specialDays: SpecialDay[];
  onChange: () => void;
}) {
  const [date, setDate] = useState("");
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("18:00");
  const [isPublic, setIsPublic] = useState(true);
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setDate("");
    setOpenTime("10:00");
    setCloseTime("18:00");
    setIsPublic(true);
    setNote("");
    setEditingId(null);
    setError(null);
  }

  function startEdit(s: SpecialDay) {
    setEditingId(s.id);
    setDate(dateKey(new Date(s.date), tz));
    setOpenTime(minutesToHHMM(s.openMinute));
    setCloseTime(minutesToHHMM(s.closeMinute));
    setIsPublic(s.isPublic);
    setNote(s.note);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError("Bitte ein Datum wählen.");
      return;
    }
    if (hhmmToMinutes(closeTime) <= hhmmToMinutes(openTime)) {
      setError("Schließzeit muss nach der Öffnungszeit liegen.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/admin/special-days/${editingId}`
        : "/api/admin/special-days";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          openMinute: hhmmToMinutes(openTime),
          closeMinute: hhmmToMinutes(closeTime),
          isPublic,
          note,
        }),
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
    await fetch(`/api/admin/special-days/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    onChange();
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <h2 className="text-sm font-semibold">Extra-Arbeitstage</h2>
      <p className="mt-1 text-xs text-muted">
        Öffne einen einzelnen Tag, der laut Öffnungszeiten eigentlich zu ist –
        mit eigenen Uhrzeiten. „Öffentlich buchbar“ erscheint im Kunden-Kalender;
        „Nur für mich“ ist nur intern in deiner Terminübersicht sichtbar.
      </p>

      {specialDays.length === 0 ? (
        <p className="mt-4 rounded-lg bg-surface px-3 py-3 text-sm text-muted">
          Noch keine Extra-Arbeitstage eingetragen.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {specialDays.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                  isEditing ? "border-brand bg-brand-soft" : "border-line bg-surface"
                }`}
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    {formatDateLabel(new Date(s.date), tz)}
                  </span>
                  <span className="text-muted">
                    {" "}
                    · {minutesToHHMM(s.openMinute)}–{minutesToHHMM(s.closeMinute)} Uhr
                  </span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      s.isPublic
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {s.isPublic ? "öffentlich buchbar" : "nur für mich"}
                  </span>
                  {s.note && <span className="text-muted"> · {s.note}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => startEdit(s)}
                    className="text-muted underline underline-offset-4 hover:text-brand"
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => remove(s.id)}
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
          {editingId ? "Eintrag bearbeiten" : "Extra-Arbeitstag hinzufügen"}
        </p>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Datum</span>
          <div className="max-w-[14rem]">
            <DatePicker value={date} onChange={setDate} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Von</span>
          <select
            value={openTime}
            onChange={(e) => setOpenTime(e.target.value)}
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
            value={closeTime}
            onChange={(e) => setCloseTime(e.target.value)}
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
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setIsPublic(true)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${
              isPublic
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-background text-muted ring-line"
            }`}
          >
            Öffentlich buchbar
          </button>
          <button
            type="button"
            onClick={() => setIsPublic(false)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${
              !isPublic
                ? "bg-foreground text-background ring-foreground"
                : "bg-background text-muted ring-line"
            }`}
          >
            Nur für mich
          </button>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Notiz (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Sondertermin"
            className="rounded-lg border border-line bg-background px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
          >
            {saving
              ? "Speichern…"
              : editingId
                ? "Änderungen speichern"
                : "Tag hinzufügen"}
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
