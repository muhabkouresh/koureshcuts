"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  formatDateTimeLabel,
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
  // No-show history of this customer (risk badge on upcoming appointments).
  riskNoShows: number;
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
  date: string | null;
  weekdays: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  notifiedAt: string | null;
};

type Data = {
  feedUrl: string;
  bookingWindowDays: number;
  reminderEnabled: boolean;
  reminderLeadHours: number;
  cancelDeadlineHours: number;
  maxActiveBookingsPerEmail: number;
  noShowBlockThreshold: number;
  winbackWeeks: number;
  ownerCopyEmails: boolean;
  emailFailures: number;
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
  PENDING: "wartet auf Freigabe",
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
    | "termine"
    | "kunden"
    | "umsatz"
    | "statistik"
    | "services"
    | "verfuegbarkeit"
    | "verspaetungen"
  >("termine");
  // Global search can jump into a tab with a preselected date/customer; a
  // bumped key remounts the tab so its internal state picks the target up.
  const [jump, setJump] = useState<{
    n: number;
    date?: string;
    customerQuery?: string;
  }>({ n: 0 });
  // Offline indicator — the SW serves the last cached copy of this page, so
  // the plan stays readable; actions need the network again.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- client-only navigator state */
    setOffline(!navigator.onLine);
    /* eslint-enable react-hooks/set-state-in-effect */
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Live sync: new bookings/cancellations appear without a manual reload.
  // Three triggers — the booking push (relayed by the service worker as a
  // "kc:refresh" message, near-instant), returning to the foreground, and a
  // 30s heartbeat while the tab is visible and online.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        router.refresh();
      }
    };
    const id = window.setInterval(refresh, 30_000);
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === "kc:refresh") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMsg);
    }
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMsg);
      }
    };
  }, [router]);

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
        <div className="flex items-center gap-4">
          {!offline && (
            <span
              className="flex items-center gap-1.5 text-xs font-medium text-muted"
              title="Neue Buchungen erscheinen automatisch — kein Neuladen nötig"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          <button
            onClick={logout}
            className="text-sm text-muted underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Abmelden
          </button>
        </div>
      </div>

      {offline && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          📴 Offline — du siehst den zuletzt geladenen Stand. Änderungen sind
          erst wieder mit Internet möglich.
        </p>
      )}

      {data.emailFailures > 0 && (
        <MailFailureBanner
          count={data.emailFailures}
          onDone={() => router.refresh()}
        />
      )}

      <GlobalSearch
        appointments={data.appointments}
        onOpenDay={(date) =>
          setJump((j) => ({ n: j.n + 1, date }))
        }
        onOpenCustomer={(q) =>
          setJump((j) => ({ n: j.n + 1, customerQuery: q }))
        }
        goToTermine={() => setTab("termine")}
        goToKunden={() => setTab("kunden")}
      />

      <div className="mt-6 inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-background p-1 text-sm shadow-soft">
        {(
          [
            ["termine", "Termine"],
            ["kunden", "Kunden"],
            ["umsatz", "Umsatz"],
            ["statistik", "Statistik"],
            ["services", "Services"],
            ["verfuegbarkeit", "Verfügbarkeit"],
            ["verspaetungen", "Verspätungen"],
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
          key={`t-${jump.n}`}
          initialDate={jump.date}
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
        <KundenTab
          key={`k-${jump.n}`}
          initialQuery={jump.customerQuery}
          services={data.services}
          noShowThreshold={data.noShowBlockThreshold}
          winbackWeeks={data.winbackWeeks}
          onChange={() => router.refresh()}
        />
      )}
      {tab === "umsatz" && <UmsatzTab revenue={data.revenue} />}
      {tab === "statistik" && <StatistikTab />}
      {tab === "services" && <ServicesTab onChange={() => router.refresh()} />}
      {tab === "verfuegbarkeit" && (
        <Availability
          hours={data.hours}
          timeOff={data.timeOff}
          specialDays={data.specialDays}
          bookingWindowDays={data.bookingWindowDays}
          reminderEnabled={data.reminderEnabled}
          reminderLeadHours={data.reminderLeadHours}
          cancelDeadlineHours={data.cancelDeadlineHours}
          maxActiveBookingsPerEmail={data.maxActiveBookingsPerEmail}
          noShowBlockThreshold={data.noShowBlockThreshold}
          ownerCopyEmails={data.ownerCopyEmails}
          onChange={() => router.refresh()}
        />
      )}
      {tab === "verspaetungen" && <VerspaetungenTab />}
    </main>
  );
}

/* ---------------------------- Mail failure banner --------------------------- */

// Shown while refused mails (e.g. Resend daily limit) wait for a retry. The
// cron retries automatically at 07:00; the button triggers it right away.
function MailFailureBanner({
  count,
  onDone,
}: {
  count: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/email-failures", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error ?? "Fehler.");
        return;
      }
      if (d.retried > 0) {
        setMsg(
          `${d.retried} E-Mail${d.retried === 1 ? "" : "s"} nachgesendet.` +
            (d.stillFailing > 0
              ? ` ${d.stillFailing} weiterhin nicht zustellbar.`
              : ""),
        );
      } else {
        setMsg(
          "Weiterhin nicht zustellbar — nächster automatischer Versuch morgen früh um 7 Uhr.",
        );
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
      <p className="font-semibold">
        ⚠️ {count} E-Mail{count === 1 ? " konnte" : "s konnten"} nicht
        zugestellt werden
      </p>
      <p className="mt-0.5 text-[13px] text-red-700">
        Wahrscheinlich ist das Tageslimit des E-Mail-Dienstes erreicht. Morgen
        früh um 7 Uhr wird der Versand automatisch wiederholt — keine E-Mail
        geht verloren.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={retry}
          disabled={busy}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Sende…" : "Jetzt erneut versuchen"}
        </button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}

/* ------------------------------- Global search ------------------------------ */

// Cross-tab quick search: type a name/email/phone, jump straight to a
// customer's next appointment (Termine tab) or their profile (Kunden tab).
function GlobalSearch({
  appointments,
  onOpenDay,
  onOpenCustomer,
  goToTermine,
  goToKunden,
}: {
  appointments: Appointment[];
  onOpenDay: (date: string) => void;
  onOpenCustomer: (query: string) => void;
  goToTermine: () => void;
  goToKunden: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (query.length < 2) return [];
    const now = nowMs();
    const map = new Map<
      string,
      {
        name: string;
        email: string;
        phone: string;
        upcoming: { id: string; start: string }[];
      }
    >();
    for (const a of appointments) {
      if (a.status === "BLOCKED") continue;
      const key = (a.customerEmail || a.customerName).toLowerCase();
      if (!key) continue;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          name: a.customerName,
          email: a.customerEmail,
          phone: a.customerPhone,
          upcoming: [],
        };
        map.set(key, entry);
      }
      const isActive = a.status === "CONFIRMED" || a.status === "PENDING";
      if (isActive && new Date(a.start).getTime() > now) {
        entry.upcoming.push({ id: a.id, start: a.start });
      }
    }
    const matches = [...map.values()].filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        (c.phone && c.phone.toLowerCase().includes(query)),
    );
    for (const m of matches) {
      m.upcoming.sort((a, b) => a.start.localeCompare(b.start));
    }
    return matches.slice(0, 6);
  }, [appointments, query]);

  return (
    <div className="relative mt-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔎 Schnellsuche: Name, E-Mail oder Telefon…"
        className="w-full rounded-full border border-line bg-surface px-5 py-2.5 text-sm outline-none focus:border-brand"
      />
      {query.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-background shadow-soft">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Keine Treffer.</p>
          ) : (
            <ul>
              {results.map((c) => (
                <li
                  key={`${c.name}|${c.email}`}
                  className="border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {c.name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {c.email || c.phone || "—"}
                      </span>
                    </span>
                    <button
                      onClick={() => {
                        goToKunden();
                        onOpenCustomer(c.email || c.name);
                        setQ("");
                      }}
                      className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:ring-brand"
                    >
                      Kundenprofil
                    </button>
                  </div>
                  {c.upcoming.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.upcoming.slice(0, 3).map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            goToTermine();
                            onOpenDay(dateKey(new Date(u.start), tz));
                            setQ("");
                          }}
                          className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand hover:text-white"
                        >
                          {formatDateLabel(new Date(u.start), tz)} ·{" "}
                          {formatClock(new Date(u.start), tz)}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
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
  initialDate,
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
  initialDate?: string;
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
  const [selected, setSelected] = useState<string>(initialDate ?? today);
  const [showForm, setShowForm] = useState(false);
  // When "Besetzen" is chosen for a specific free slot, prefill the form's time.
  const [formTime, setFormTime] = useState<string | undefined>(undefined);

  const waitlistByDay = useMemo(() => {
    const map = new Map<string, WaitlistItem[]>();
    for (const w of waitlist) {
      if (!w.date) continue;
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

      {stats.todayCount > 0 && <DelayCard />}

      <EmergencyCard appointments={appointments} onChange={onChange} />

      {waitlist.length > 0 && (
        <QueueCard
          entries={waitlist}
          selectedDate={selected}
          onChange={onChange}
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
                <span className="flex h-3.5 items-center gap-0.5">
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
                      className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold leading-none text-amber-950"
                      title={`${wl} auf der Warteliste`}
                    >
                      {wl}
                    </span>
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
          waitlist={waitlist}
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
              swapPool={appointments}
              siteName={siteName}
              onChange={onChange}
            />
          ))}
        </ul>
      )}

      {selected <= today &&
        realAppts.some(
          (a) => a.status === "PENDING" || a.status === "CONFIRMED",
        ) && (
          <CloseDayCard
            key={selected}
            appointments={realAppts.filter(
              (a) => a.status === "PENDING" || a.status === "CONFIRMED",
            )}
            onChange={onChange}
          />
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

      <StoryCard services={services} />

      {feedUrl && <FeedBox feedUrl={feedUrl} />}
    </div>
  );
}

// Notfall-Knopf: close today (or today + tomorrow) at short notice — one
// action blocks the day(s), cancels every remaining appointment and emails
// the affected customers; the public site shows a red closure banner.
function EmergencyCard({
  appointments,
  onChange,
}: {
  appointments: Appointment[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const today = todayInTz(tz);
  // Matches the server's conflict query: active bookings starting from now
  // within the closed range. Snapshot of "now" at render is close enough.
  const affected = useMemo(() => {
    const until = addDaysToDateStr(today, days - 1);
    const nowIso = new Date().toISOString();
    return appointments.filter((a) => {
      if (a.status !== "CONFIRMED" && a.status !== "PENDING") return false;
      const ds = dateKey(new Date(a.start), tz);
      return ds >= today && ds <= until && a.start >= nowIso;
    });
  }, [appointments, days, today]);

  async function close() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/emergency-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(
          `Geschlossen. ${d.cancelled} Termin${d.cancelled === 1 ? "" : "e"} abgesagt, ${d.notified} Kunde${d.notified === 1 ? "" : "n"} per E-Mail informiert.`,
        );
        setArmed(false);
        onChange();
      } else {
        setMsg(d.error ?? "Fehler.");
        setArmed(false);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
      >
        🚨 Notfall — kurzfristig schließen
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-red-800">
            🚨 Notfall — kurzfristig schließen
          </h2>
          <p className="mt-1 text-xs text-red-700">
            Krank geworden oder ein Notfall? Ein Klick: Die Tage werden für
            Online-Buchungen gesperrt, alle betroffenen Termine abgesagt und
            die Kunden automatisch per E-Mail informiert. Auf der Website
            erscheint ein roter Hinweis.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            setArmed(false);
            setMsg(null);
          }}
          className="text-xs text-red-700 underline underline-offset-2"
        >
          Schließen
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <select
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setArmed(false);
          }}
          className="rounded-lg border border-red-200 bg-background px-3 py-2"
        >
          <option value={1}>Nur heute</option>
          <option value={2}>Heute + morgen</option>
        </select>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="Grund (optional, steht in der Absage-Mail)"
          className="min-w-0 flex-1 rounded-lg border border-red-200 bg-background px-3 py-2"
        />
      </div>

      <p className="mt-3 text-xs font-medium text-red-800">
        {affected.length === 0
          ? "Keine offenen Termine im Zeitraum — die Tage werden nur gesperrt."
          : `${affected.length} Termin${affected.length === 1 ? " wird" : "e werden"} abgesagt; Kunden mit E-Mail-Adresse werden benachrichtigt.`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!armed ? (
          <button
            onClick={() => {
              setArmed(true);
              setMsg(null);
            }}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Schließen & Termine absagen
          </button>
        ) : (
          <>
            <button
              onClick={close}
              disabled={busy}
              className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Wird geschlossen…" : "Wirklich schließen — jetzt absagen"}
            </button>
            <button
              onClick={() => setArmed(false)}
              disabled={busy}
              className="text-sm text-red-700 underline underline-offset-2"
            >
              Abbrechen
            </button>
          </>
        )}
        {msg && <span className="text-xs font-medium text-red-800">{msg}</span>}
      </div>

      <p className="mt-3 text-[11px] text-red-700/80">
        Wieder öffnen: Sperre unter Verfügbarkeit → Abwesenheiten löschen.
      </p>
    </section>
  );
}

// Instagram-story generator: renders the week's free slots (or a "fully
// booked" variant) onto a 1080×1920 canvas in brand colors, ready to download
// and post. Everything happens client-side.
function StoryCard({ services }: { services: Service[] }) {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setReady(false);
    try {
      const start = todayInTz(tz);
      const days = Array.from({ length: 7 }, (_, i) =>
        addDaysToDateStr(start, i),
      );
      const results = await Promise.all(
        days.map(async (ds) => {
          try {
            const d = await fetch(
              `/api/availability?serviceId=${serviceId}&date=${ds}`,
            ).then((r) => r.json());
            const times: string[] = (d.slots ?? []).map((s: { start: string }) =>
              formatClock(new Date(s.start), tz),
            );
            return { ds, times };
          } catch {
            return { ds, times: [] as string[] };
          }
        }),
      );
      const withSlots = results.filter((r) => r.times.length > 0);
      draw(withSlots);
      setReady(true);
    } catch {
      setError("Bild konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  function draw(days: { ds: string; times: string[] }[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

    // Brand-red vertical gradient with a soft vignette circle.
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#7d1c27");
    grad.addColorStop(1, "#380c12");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.arc(W, 120, 420, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, H - 160, 360, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 52px ${FONT}`;
    ctx.fillText("✂", W / 2, 200);
    ctx.font = `700 72px ${FONT}`;
    ctx.fillText(siteConfig.name, W / 2, 300);

    const booked = days.length === 0;
    ctx.font = `800 116px ${FONT}`;
    ctx.fillText(booked ? "AUSGEBUCHT" : "FREIE TERMINE", W / 2, 520);
    ctx.font = `400 52px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(
      booked ? "diese Woche — aber:" : "die nächsten 7 Tage",
      W / 2,
      600,
    );

    if (booked) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 56px ${FONT}`;
      ctx.fillText("Trag dich auf die Warteliste ein —", W / 2, 860);
      ctx.fillText("du bekommst sofort Bescheid,", W / 2, 950);
      ctx.fillText("wenn ein Platz frei wird! 🔔", W / 2, 1040);
    } else {
      // One rounded card per day with up to 4 times (+N weitere).
      let y = 720;
      const shown = days.slice(0, 6);
      for (const day of shown) {
        const label = formatDateLabel(zonedToUtc(day.ds, 12 * 60, tz), tz);
        // Max 3 times per row — keeps the 42px line safely inside the card.
        const times =
          day.times.slice(0, 3).join(" · ") +
          (day.times.length > 3 ? `  +${day.times.length - 3} weitere` : "");
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.roundRect(90, y, W - 180, 150, 28);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.font = `700 46px ${FONT}`;
        ctx.fillText(label, 130, y + 62);
        ctx.font = `400 42px ${FONT}`;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(times, 130, y + 122);
        ctx.textAlign = "center";
        y += 178;
      }
    }

    // CTA pill.
    const pillY = 1660;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 330, pillY, 660, 110, 55);
    ctx.fill();
    ctx.fillStyle = "#7d1c27";
    ctx.font = `700 46px ${FONT}`;
    ctx.fillText(
      booked ? "koureshcuts.de" : "Jetzt buchen: koureshcuts.de",
      W / 2,
      pillY + 72,
    );
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `story-${todayInTz(tz)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, "image/png");
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">📸 Instagram-Story erstellen</span>
        <span className="text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <p className="text-xs text-muted">
            Erzeugt ein fertiges Story-Bild (1080 × 1920) mit den freien
            Terminen der nächsten 7 Tage — herunterladen und direkt in deine
            Instagram-Story posten. Sind alle Termine weg, entsteht eine
            „Ausgebucht — Warteliste“-Story.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="rounded-lg border border-line bg-background px-2 py-2 text-sm"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !serviceId}
              onClick={generate}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Lädt freie Termine…" : "Story-Bild erstellen"}
            </button>
            {ready && (
              <button
                onClick={download}
                className="rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background"
              >
                ⬇ Bild herunterladen
              </button>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
          <canvas
            ref={canvasRef}
            className={`mt-3 w-48 rounded-xl ring-1 ring-line ${ready ? "" : "hidden"}`}
          />
        </div>
      )}
    </section>
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
  const [assignFor, setAssignFor] = useState<string | null>(null);
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
          <li key={w.id} className="rounded-xl bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                <button
                  onClick={() =>
                    setAssignFor(assignFor === w.id ? null : w.id)
                  }
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-[1.03]"
                >
                  Zuteilen
                </button>
                {w.notifiedAt ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                    benachrichtigt
                  </span>
                ) : (
                  <button
                    disabled={busyId === w.id}
                    onClick={() => notify(w.id)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-brand hover:text-brand disabled:opacity-50"
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
            </div>
            {assignFor === w.id && (
              <AssignBox
                entry={w}
                defaultDate={date}
                onDone={() => {
                  setAssignFor(null);
                  onChange();
                }}
              />
            )}
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
  waitlist,
  onChange,
  onBesetzen,
}: {
  date: string;
  hours: DayHours[];
  special: SpecialDay | null;
  appointments: Appointment[];
  waitlist: WaitlistItem[];
  onChange: () => void;
  onBesetzen: (hhmm: string) => void;
}) {
  const [sel, setSel] = useState<{
    hhmm: string;
    kind: "free" | "blocked";
    apptId?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  // Waitlist candidates for this day, best match first: exact wish day,
  // then flexible entries whose weekdays fit, then everyone else.
  const dayWd = weekdayOf(date);
  const candidates = [...waitlist].sort((a, b) => {
    const rank = (w: WaitlistItem) => {
      if (w.date && dateKey(new Date(w.date), tz) === date) return 0;
      if (!w.date && (!w.weekdays || w.weekdays.split(",").includes(String(dayWd))))
        return 1;
      return 2;
    };
    return rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt);
  });

  async function assignFromWaitlist(entryId: string, name: string) {
    if (!sel) return;
    if (
      !window.confirm(
        `${name} den Termin am ${longDateFromStr(date)} um ${sel.hhmm} Uhr fest zuteilen? Der Kunde bekommt die Bestätigung per E-Mail.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setPickError(null);
    try {
      const start = zonedToUtc(date, hhmmToMinutes(sel.hhmm), tz).toISOString();
      const res = await fetch(`/api/admin/waitlist/${entryId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPickError(d.error ?? "Zuteilung fehlgeschlagen.");
        return;
      }
      setSel(null);
      setPickOpen(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

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
                  setPickOpen(false);
                }}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                👤 Besetzen
              </button>
              {candidates.length > 0 && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setPickOpen((o) => !o);
                    setPickError(null);
                  }}
                  className="rounded-lg border border-brand/40 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand hover:text-white disabled:opacity-50"
                >
                  📋 Aus Warteliste
                </button>
              )}
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
            onClick={() => {
              setSel(null);
              setPickOpen(false);
            }}
            className="ml-auto rounded-lg px-2 py-1 text-xs text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {sel?.kind === "free" && pickOpen && (
        <div className="mt-2 rounded-xl border border-brand/30 bg-brand-soft/30 p-3">
          <p className="text-xs font-semibold">
            Wen aus der Warteliste um {sel.hhmm} Uhr eintragen?
          </p>
          {pickError && (
            <p className="mt-2 text-xs text-red-600">{pickError}</p>
          )}
          <ul className="mt-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
            {candidates.slice(0, 12).map((w) => {
              const exact =
                w.date && dateKey(new Date(w.date), tz) === date;
              return (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-xs ring-1 ring-line"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {w.customerName}
                      <span className="ml-1.5 font-normal text-muted">
                        {w.serviceName}
                      </span>
                    </span>
                    <span className={exact ? "font-medium text-brand" : "text-muted"}>
                      {exact ? "✓ Wunschtag" : queueWishLabel(w)}
                    </span>
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => assignFromWaitlist(w.id, w.customerName)}
                    className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 font-semibold text-white disabled:opacity-50"
                  >
                    Zuteilen
                  </button>
                </li>
              );
            })}
          </ul>
          {candidates.length > 12 && (
            <p className="mt-1.5 text-[11px] text-muted">
              … und {candidates.length - 12} weitere — alle in der Karte
              „Warteliste gesamt“.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// What a waitlist entry is waiting for, as a short label.
function queueWishLabel(w: WaitlistItem): string {
  if (w.date) return formatDateLabel(new Date(w.date), tz);
  if (w.weekdays) {
    return (
      "Nur " +
      w.weekdays
        .split(",")
        .map((d) => WEEKDAY_SHORT[Number(d)] ?? "")
        .filter(Boolean)
        .join(", ")
    );
  }
  return "Jeder Tag";
}

// Inline form to assign a waitlist entry a concrete appointment: pick date +
// time, the customer is booked and confirmed by email. Not restricted to
// opening hours — made for appending extra slots to a day.
function AssignBox({
  entry,
  defaultDate,
  onDone,
}: {
  entry: WaitlistItem;
  defaultDate: string;
  onDone: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("17:30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    const start = zonedToUtc(date, hhmmToMinutes(time), tz).toISOString();
    if (
      !window.confirm(
        `${entry.customerName} den Termin am ${longDateFromStr(date)} um ${time} Uhr fest zuteilen? Der Kunde bekommt die Bestätigung per E-Mail.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/waitlist/${entry.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Zuteilung fehlgeschlagen.");
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 w-full rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
      <p className="text-xs font-semibold">
        Termin zuteilen: {entry.serviceName} für {entry.customerName}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-[11rem]">
          <DatePicker value={date} onChange={setDate} />
        </div>
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-lg border border-line bg-background px-2 py-2 text-sm"
        >
          {TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={assign}
          className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "Fest zuteilen"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        Auch außerhalb der Öffnungszeiten möglich — nur Überschneidungen mit
        bestehenden Terminen werden blockiert.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// The full waitlist across all days, grouped per person (many customers put
// themselves down for several days). Searchable; every wish can be assigned a
// concrete appointment directly or removed.
function QueueCard({
  entries,
  selectedDate,
  onChange,
}: {
  entries: WaitlistItem[];
  selectedDate: string;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Eintrag wirklich von der Warteliste entfernen?")) {
      return;
    }
    setBusyId(id);
    try {
      await fetch(`/api/admin/waitlist/${id}`, { method: "DELETE" });
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  const q = query.toLowerCase().trim();
  const filtered = q
    ? entries.filter(
        (w) =>
          w.customerName.toLowerCase().includes(q) ||
          w.customerEmail.toLowerCase().includes(q),
      )
    : entries;

  // One group per person (email as key, name as fallback for walk-ins).
  const groups = new Map<
    string,
    { name: string; email: string; items: WaitlistItem[] }
  >();
  for (const w of filtered) {
    const key = (w.customerEmail || w.customerName).toLowerCase();
    const g = groups.get(key) ?? {
      name: w.customerName,
      email: w.customerEmail,
      items: [],
    };
    g.items.push(w);
    groups.set(key, g);
  }
  const groupRows = [...groups.entries()];

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M4 6h16M4 12h10M4 18h6" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <h3 className="text-sm font-bold">
            Warteliste gesamt{" "}
            <span className="text-muted">
              ({groups.size || entries.length} Personen · {entries.length}{" "}
              Wünsche)
            </span>
          </h3>
        </div>
        <span className="text-sm text-muted">{open ? "▴" : "▾"}</span>
      </button>
      <p className="mt-1 text-xs text-muted">
        Alle Wartenden, pro Person gebündelt. „Zuteilen“ bucht direkt einen
        festen Termin — z. B. einen Slot, den du an einen Tag anhängst.
      </p>

      {open && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche Name oder E-Mail…"
            className="mt-3 w-full rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-brand"
          />
          {groupRows.length === 0 ? (
            <p className="mt-3 rounded-lg bg-surface px-3 py-3 text-sm text-muted">
              Keine Treffer.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {groupRows.map(([key, g]) => {
                const isOpen = expanded === key;
                return (
                  <li
                    key={key}
                    className="overflow-hidden rounded-xl bg-surface"
                  >
                    <button
                      onClick={() => {
                        setExpanded(isOpen ? null : key);
                        setAssignFor(null);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-background"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-700">
                        {(g.name.trim()[0] || "?").toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {g.name}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {g.email || "keine E-Mail"}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                        {g.items.length} Wunsch{g.items.length === 1 ? "" : "termine"}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="border-t border-line bg-background px-4 py-2">
                        {g.items.map((w) => (
                          <li
                            key={w.id}
                            className="border-b border-line py-2.5 last:border-0"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="min-w-0 text-sm">
                                <span className="font-medium">
                                  {queueWishLabel(w)}
                                </span>
                                <span className="ml-2 text-xs text-muted">
                                  {w.serviceName} · seit{" "}
                                  {formatDateLabel(new Date(w.createdAt), tz)}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <button
                                  onClick={() =>
                                    setAssignFor(
                                      assignFor === w.id ? null : w.id,
                                    )
                                  }
                                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Zuteilen
                                </button>
                                <button
                                  disabled={busyId === w.id}
                                  onClick={() => remove(w.id)}
                                  className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                                >
                                  Entfernen
                                </button>
                              </span>
                            </div>
                            {assignFor === w.id && (
                              <AssignBox
                                entry={w}
                                defaultDate={
                                  w.date
                                    ? dateKey(new Date(w.date), tz)
                                    : selectedDate
                                }
                                onDone={() => {
                                  setAssignFor(null);
                                  onChange();
                                }}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// One-tap "running late today" broadcast: informs every remaining customer
// today by email. Appointments themselves stay unchanged.
function DelayCard() {
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    if (
      !window.confirm(
        `Alle heutigen Kunden per E-Mail über ca. ${minutes} Min. Verzögerung informieren?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/notify-delay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(
        res.ok
          ? `${d.sent} von ${d.considered} Kunde(n) informiert.`
          : (d.error ?? "Fehler beim Senden."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm">
      <span className="font-semibold text-amber-900">Läufst du heute später?</span>
      <select
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        className="rounded-lg border border-amber-300 bg-background px-2 py-1.5 text-sm"
      >
        {[15, 30, 45, 60].map((m) => (
          <option key={m} value={m}>
            ca. +{m} Min.
          </option>
        ))}
      </select>
      <button
        onClick={send}
        disabled={busy}
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Sendet…" : "Heutige Kunden informieren"}
      </button>
      {msg && <span className="text-xs text-amber-900">{msg}</span>}
    </section>
  );
}

type DelayEntry = {
  id: string;
  date: string;
  minutes: number;
  customerName: string;
  customerEmail: string;
  note: string;
};

// Per-customer delay minute accounts: assign minutes to a customer whenever
// they show up late; the tab sums them per customer (and week/month overall).
function VerspaetungenTab() {
  const [entries, setEntries] = useState<DelayEntry[]>([]);
  const [customers, setCustomers] = useState<CustomerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Assignment form.
  const [custQuery, setCustQuery] = useState("");
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [date, setDate] = useState(() => todayInTz(tz));
  const [minutes, setMinutes] = useState(10);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/delays")
      .then((r) => r.json())
      .then((d) => setEntries(d.delays ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    fetch("/api/admin/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {});
  }, []);

  // Overall sums over the shop-timezone calendar (week starts Monday).
  const today = todayInTz(tz);
  const monday = addDaysToDateStr(today, -((weekdayOf(today) + 6) % 7));
  const nextMonday = addDaysToDateStr(monday, 7);
  const monthKey = today.slice(0, 7);
  let weekSum = 0;
  let monthSum = 0;
  let totalSum = 0;
  for (const e of entries) {
    const ds = dateKey(new Date(e.date), tz);
    totalSum += e.minutes;
    if (ds >= monday && ds < nextMonday) weekSum += e.minutes;
    if (ds.startsWith(monthKey)) monthSum += e.minutes;
  }

  // Minute accounts: group by lowercase email, falling back to the name for
  // walk-ins without one. The most recent entry provides the display name.
  const accounts = new Map<
    string,
    { name: string; email: string; total: number; items: DelayEntry[] }
  >();
  for (const e of entries) {
    const key = (e.customerEmail || e.customerName).toLowerCase();
    if (!key) continue;
    const acc = accounts.get(key) ?? {
      name: e.customerName,
      email: e.customerEmail,
      total: 0,
      items: [],
    };
    acc.total += e.minutes;
    acc.items.push(e);
    if (!acc.name && e.customerName) acc.name = e.customerName;
    accounts.set(key, acc);
  }
  const accountRows = [...accounts.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  );

  const q = custQuery.toLowerCase().trim();
  const suggestions = q
    ? customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q),
        )
        .slice(0, 5)
    : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/delays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          minutes,
          customerName: custName,
          customerEmail: custEmail,
          note,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Konnte nicht gespeichert werden.");
        return;
      }
      setMsg(`${minutes} Min. für ${custName} eingetragen.`);
      setNote("");
      setCustQuery("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/delays/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Diese Woche"
          value={weekSum}
          unit="Min."
          icon={
            <>
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <path d="M12 7v5l3 2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </>
          }
        />
        <StatCard
          label="Dieser Monat"
          value={monthSum}
          unit="Min."
          icon={
            <>
              <rect x="3" y="4" width="18" height="17" rx="3" strokeWidth="2" />
              <path d="M3 9h18M8 2v4M16 2v4" strokeWidth="2" strokeLinecap="round" />
            </>
          }
        />
        <StatCard
          label="Letzte 12 Monate"
          value={totalSum}
          unit="Min."
          icon={
            <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          }
        />
      </div>

      <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
        <h2 className="text-sm font-semibold">Verspätung einem Kunden zuteilen</h2>
        <p className="mt-1 text-xs text-muted">
          Die Minuten landen auf dem Minutenkonto des Kunden. Der Kunde wird
          dabei nicht benachrichtigt.
        </p>
        <form onSubmit={submit} className="mt-3 grid gap-3">
          <div className="relative">
            <input
              type="text"
              value={custQuery}
              onChange={(e) => setCustQuery(e.target.value)}
              placeholder="Kunde suchen (Name oder E-Mail)…"
              className="w-full rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-brand"
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-background shadow-soft">
                {suggestions.map((c) => (
                  <li key={`${c.name}|${c.email}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setCustName(c.name);
                        setCustEmail(c.email);
                        setCustQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-surface"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="truncate text-xs text-muted">
                        {c.email}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm">
              <span className="text-muted">Kundenname *</span>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                maxLength={120}
                placeholder="Max Mustermann"
                className="rounded-lg border border-line bg-background px-3 py-2"
              />
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm">
              <span className="text-muted">E-Mail (optional)</span>
              <input
                type="email"
                value={custEmail}
                onChange={(e) => setCustEmail(e.target.value)}
                maxLength={200}
                placeholder="max@beispiel.de"
                className="rounded-lg border border-line bg-background px-3 py-2"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Datum</span>
              <div className="w-[12rem]">
                <DatePicker value={date} onChange={setDate} />
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Minuten</span>
              <input
                type="number"
                min={1}
                max={600}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="w-24 rounded-lg border border-line bg-background px-3 py-2"
              />
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm">
              <span className="text-muted">Notiz (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="z. B. 10 Min. zu spät zum Termin"
                className="rounded-lg border border-line bg-background px-3 py-2"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          <div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              {saving ? "Speichern…" : "Minuten zuteilen"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
        <h2 className="text-sm font-semibold">Minutenkonten</h2>
        <p className="mt-1 text-xs text-muted">
          Gesammelte Verspätungsminuten pro Kunde — höchste zuerst. Antippen
          für die einzelnen Einträge.
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Lädt…</p>
        ) : accountRows.length === 0 ? (
          <p className="mt-3 rounded-lg bg-surface px-3 py-3 text-sm text-muted">
            Noch keine Verspätungen zugeteilt.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {accountRows.map(([key, acc]) => {
              const isOpen = expanded === key;
              return (
                <li
                  key={key}
                  className="overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-background"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {acc.name || acc.email}
                      </span>
                      {acc.email && acc.name && (
                        <span className="block truncate text-xs text-muted">
                          {acc.email}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-bold text-amber-700">
                        {acc.total} Min.
                      </span>
                      <span className="block text-xs text-muted">
                        {acc.items.length} Eintrag
                        {acc.items.length === 1 ? "" : "e"}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="border-t border-line bg-background px-4 py-2">
                      {acc.items.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-0"
                        >
                          <span className="min-w-0">
                            {formatDateLabel(new Date(e.date), tz)}
                            <span className="ml-2 font-semibold text-amber-700">
                              +{e.minutes} Min.
                            </span>
                            {e.note && (
                              <span className="text-muted"> · {e.note}</span>
                            )}
                          </span>
                          <button
                            onClick={() => remove(e.id)}
                            className="shrink-0 text-xs text-muted underline underline-offset-4 hover:text-red-600"
                          >
                            Löschen
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function AgendaCard({
  appt: a,
  swapPool,
  siteName,
  onChange,
}: {
  appt: Appointment;
  /** All loaded appointments — source for the swap-partner picker. */
  swapPool: Appointment[];
  siteName: string;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [cancelReason, setCancelReason] = useState("");
  // Quick "customer was late" entry onto their minute account.
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(10);
  const [delayMsg, setDelayMsg] = useState<string | null>(null);
  // Owner-initiated reschedule: pick a new date/time, customer gets an email.
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState(() => dateKey(new Date(a.start), tz));
  const [moveTime, setMoveTime] = useState(() => formatClock(new Date(a.start), tz));
  const [moveNotify, setMoveNotify] = useState(true);
  const [moveReason, setMoveReason] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  // Swap this appointment's time with another customer's ("Tauschen").
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState("");
  const [swapNotify, setSwapNotify] = useState(true);
  const [swapError, setSwapError] = useState<string | null>(null);
  // If the booking starts off the 15-minute grid, keep its time selectable.
  const moveTimeOptions = TIME_OPTIONS.includes(moveTime)
    ? TIME_OPTIONS
    : [...TIME_OPTIONS, moveTime].sort();

  const swapCandidates = useMemo(() => {
    const nowIso = new Date().toISOString();
    return swapPool
      .filter(
        (c) =>
          c.id !== a.id &&
          (c.status === "CONFIRMED" || c.status === "PENDING") &&
          c.start > nowIso,
      )
      .sort((x, y) => x.start.localeCompare(y.start));
  }, [swapPool, a.id]);
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

  async function setStatus(
    status: string,
    extra?: { notify?: boolean; reason?: string },
  ) {
    setBusy(true);
    try {
      await fetch(`/api/admin/appointments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      setCancelOpen(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function move() {
    const start = zonedToUtc(moveDate, hhmmToMinutes(moveTime), tz).toISOString();
    if (
      !window.confirm(
        `Termin von ${a.customerName} auf ${longDateFromStr(moveDate)} um ${moveTime} Uhr verschieben?` +
          (moveNotify && a.customerEmail
            ? " Der Kunde wird per E-Mail informiert."
            : " Der Kunde wird NICHT benachrichtigt."),
      )
    ) {
      return;
    }
    setBusy(true);
    setMoveError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${a.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start,
          notify: moveNotify,
          reason: moveReason.trim() || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMoveError(d.error ?? "Verschieben fehlgeschlagen.");
        return;
      }
      setMoveOpen(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function swap() {
    const target = swapCandidates.find((c) => c.id === swapTargetId);
    if (!target) return;
    if (
      !window.confirm(
        `Termine tauschen?\n\n${a.customerName}: ${formatDateTimeLabel(new Date(a.start), tz)} → ${formatDateTimeLabel(new Date(target.start), tz)}\n${target.customerName}: ${formatDateTimeLabel(new Date(target.start), tz)} → ${formatDateTimeLabel(new Date(a.start), tz)}\n\n` +
          (swapNotify
            ? "Beide Kunden mit E-Mail-Adresse werden informiert."
            : "Die Kunden werden NICHT benachrichtigt."),
      )
    ) {
      return;
    }
    setBusy(true);
    setSwapError(null);
    try {
      const res = await fetch("/api/admin/appointments/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aId: a.id,
          bId: target.id,
          notify: swapNotify,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSwapError(d.error ?? "Tauschen fehlgeschlagen.");
        return;
      }
      setSwapOpen(false);
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
            {!cancelled && !isPast && a.riskNoShows > 0 && (
              <span
                className="mr-1"
                title={`Schon ${a.riskNoShows}× nicht erschienen`}
              >
                ⚠️
              </span>
            )}
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
          {!cancelled && !isPast && a.riskNoShows > 0 && (
            <p className="mt-2 inline-block rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
              ⚠️ Schon {a.riskNoShows}× nicht erschienen — No-Show-Risiko
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {a.status === "PENDING" && !isPast && (
              <button
                disabled={busy}
                onClick={() => setStatus("CONFIRMED")}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              >
                ✓ Freigeben
              </button>
            )}
            {a.status !== "CANCELLED" && (
              <button
                disabled={busy}
                onClick={() => {
                  // Upcoming appointment with a reachable customer: offer to
                  // notify them; otherwise cancel straight away.
                  if (!isPast && a.customerEmail) {
                    setCancelOpen((o) => !o);
                  } else {
                    void setStatus("CANCELLED");
                  }
                }}
                className="rounded-lg border border-line px-3 py-1.5 hover:border-red-400 hover:text-red-600 disabled:opacity-50"
              >
                Stornieren
              </button>
            )}
            {!cancelled && !noShow && !isPast && (
              <button
                disabled={busy}
                onClick={() => setMoveOpen((o) => !o)}
                className="rounded-lg border border-line px-3 py-1.5 hover:border-brand hover:text-brand disabled:opacity-50"
              >
                Verschieben
              </button>
            )}
            {!cancelled && !noShow && !isPast && swapCandidates.length > 0 && (
              <button
                disabled={busy}
                onClick={() => setSwapOpen((o) => !o)}
                className="rounded-lg border border-line px-3 py-1.5 hover:border-brand hover:text-brand disabled:opacity-50"
              >
                ⇄ Tauschen
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
            {!cancelled && (
              <button
                onClick={() => setDelayOpen((o) => !o)}
                className="rounded-lg border border-line px-3 py-1.5 hover:border-amber-400 hover:text-amber-700"
              >
                Verspätung
              </button>
            )}
          </div>

          {moveOpen && (
            <div className="mt-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
              <p className="text-xs font-semibold">
                Termin verschieben: {a.serviceName} für {a.customerName}
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="w-[11rem]">
                  <DatePicker value={moveDate} onChange={setMoveDate} />
                </div>
                <select
                  value={moveTime}
                  onChange={(e) => setMoveTime(e.target.value)}
                  className="rounded-lg border border-line bg-background px-2 py-2 text-sm"
                >
                  {moveTimeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy}
                  onClick={move}
                  className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "…" : "Verschieben"}
                </button>
              </div>
              {a.customerEmail && (
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={moveNotify}
                    onChange={(e) => setMoveNotify(e.target.checked)}
                  />
                  Kunde per E-Mail informieren ({a.customerEmail})
                </label>
              )}
              {moveNotify && a.customerEmail && (
                <input
                  type="text"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  maxLength={300}
                  placeholder="Grund (optional, steht in der E-Mail)"
                  className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2 text-xs"
                />
              )}
              <p className="mt-1.5 text-[11px] text-muted">
                Auch außerhalb der Öffnungszeiten möglich — nur Überschneidungen
                mit bestehenden Terminen werden blockiert.
              </p>
              {moveError && (
                <p className="mt-2 text-xs text-red-600">{moveError}</p>
              )}
            </div>
          )}

          {swapOpen && (
            <div className="mt-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
              <p className="text-xs font-semibold">
                Termin tauschen: {a.customerName} (
                {formatDateTimeLabel(new Date(a.start), tz)}) ⇄ …
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={swapTargetId}
                  onChange={(e) => setSwapTargetId(e.target.value)}
                  className="min-w-0 max-w-full rounded-lg border border-line bg-background px-2 py-2 text-xs"
                >
                  <option value="">Tauschpartner wählen…</option>
                  {swapCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatDateTimeLabel(new Date(c.start), tz)} —{" "}
                      {c.customerName} ({c.serviceName})
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy || !swapTargetId}
                  onClick={swap}
                  className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "…" : "Tauschen"}
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={swapNotify}
                  onChange={(e) => setSwapNotify(e.target.checked)}
                />
                Beide Kunden per E-Mail informieren
              </label>
              <p className="mt-1.5 text-[11px] text-muted">
                Beide Termine wechseln die Uhrzeit, jeder behält seine Dauer.
                Überschneidungen werden blockiert.
              </p>
              {swapError && (
                <p className="mt-2 text-xs text-red-600">{swapError}</p>
              )}
            </div>
          )}

          {delayOpen && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-900">
                Verspätung von {a.customerName} notieren (Minutenkonto)
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(Number(e.target.value))}
                  className="w-20 rounded-lg border border-amber-300 bg-background px-2 py-1.5 text-xs"
                />
                <span className="text-xs text-amber-900">Minuten</span>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setDelayMsg(null);
                    try {
                      const res = await fetch("/api/admin/delays", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          date: dateKey(new Date(a.start), tz),
                          minutes: delayMinutes,
                          customerName: a.customerName,
                          customerEmail: a.customerEmail,
                          note: `Termin ${formatClock(new Date(a.start), tz)} Uhr`,
                        }),
                      });
                      const d = await res.json().catch(() => ({}));
                      setDelayMsg(
                        res.ok
                          ? `+${delayMinutes} Min. eingetragen.`
                          : (d.error ?? "Fehler."),
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "…" : "Eintragen"}
                </button>
                {delayMsg && (
                  <span className="text-xs text-amber-900">{delayMsg}</span>
                )}
              </div>
            </div>
          )}

          {cancelOpen && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
              <p className="text-xs font-semibold text-red-700">
                Termin absagen
              </p>
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                />
                Kunde per E-Mail benachrichtigen ({a.customerEmail})
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={300}
                placeholder="Grund (optional, steht in der E-Mail)"
                className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2 text-xs"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  disabled={busy}
                  onClick={() =>
                    setStatus("CANCELLED", {
                      notify: notifyCustomer,
                      reason: cancelReason.trim(),
                    })
                  }
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "…" : "Absage bestätigen"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => setCancelOpen(false)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// End-of-day wrap-up: one pass over the day's remaining active appointments,
// each toggled "erschienen" (default) or "No-Show", then a single bulk save.
function CloseDayCard({
  appointments,
  onChange,
}: {
  appointments: Appointment[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ids marked as no-show; everyone else counts as erschienen.
  const [noShowIds, setNoShowIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setNoShowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function closeDay() {
    const completed = appointments
      .filter((a) => !noShowIds.has(a.id))
      .map((a) => a.id);
    const noShows = appointments
      .filter((a) => noShowIds.has(a.id))
      .map((a) => a.id);
    if (
      !window.confirm(
        `Tag abschließen? ${completed.length} × erledigt` +
          (noShows.length ? `, ${noShows.length} × No-Show` : "") +
          ".",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/appointments/close-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed, noShows }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Abschließen fehlgeschlagen.");
        return;
      }
      setOpen(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          Tag abschließen{" "}
          <span className="font-medium text-muted">
            ({appointments.length} offen)
          </span>
        </span>
        <span className="text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <p className="text-xs text-muted">
            Alle stehen auf „erschienen“ — nur No-Shows antippen, dann
            abschließen. No-Shows zählen für die automatische Sperre.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {appointments.map((a) => {
              const isNoShow = noShowIds.has(a.id);
              return (
                <li key={a.id}>
                  <button
                    disabled={busy}
                    onClick={() => toggle(a.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ring-1 transition-colors ${
                      isNoShow
                        ? "bg-orange-50 ring-orange-300"
                        : "bg-background ring-line"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {formatClock(new Date(a.start), tz)} · {a.customerName}
                      <span className="text-muted"> · {a.serviceName}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isNoShow
                          ? "bg-orange-100 text-orange-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {isNoShow ? "✗ No-Show" : "✓ erschienen"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            disabled={busy}
            onClick={closeDay}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? "…"
              : `Abschließen (${appointments.length - noShowIds.size} erledigt${noShowIds.size ? `, ${noShowIds.size} No-Show` : ""})`}
          </button>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </section>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RevenueStat label="Diese Woche" value={priceFull(revenue.thisWeekCents)} />
        <RevenueStat
          label="Dieser Monat"
          value={priceFull(revenue.thisMonthCents)}
        />
        <RevenueStat label="Gesamt" value={priceFull(revenue.totalCents)} />
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            Voraussichtlich
          </p>
          <p className="mt-1 text-xl font-bold text-emerald-700">
            {priceFull(revenue.expectedCents)}
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-700/80">
            {revenue.expectedCount}{" "}
            {revenue.expectedCount === 1
              ? "gebuchter Termin"
              : "gebuchte Termine"}{" "}
            stehen noch aus
          </p>
        </div>
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

/* --------------------------------- Statistik -------------------------------- */

type SiteStats = {
  today: { views: number; visitors: number };
  week: { views: number; visitors: number };
  month: { views: number; visitors: number };
  daily: { day: string; views: number; visitors: number }[];
  topPaths: { label: string; count: number }[];
  topReferrers: { label: string; count: number }[];
  devices: { label: string; count: number }[];
  bookings: { week: number; month: number };
};

const PATH_LABELS: Record<string, string> = {
  "/": "Startseite",
  "/meine-termine": "Meine Termine",
  "/meine-termine/liste": "Meine Termine (Liste)",
  "/datenschutz": "Datenschutz",
  "/news/abmelden": "News-Abmeldung",
};

// Visitor analytics from the site's own privacy-light beacon: daily chart,
// totals, top pages, sources, devices, and booking conversion.
function StatistikTab() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStats(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="mt-6 text-sm text-muted">
        Statistik konnte nicht geladen werden.
      </p>
    );
  }
  if (!stats) {
    return <p className="mt-6 text-sm text-muted">Lädt…</p>;
  }

  const conversion =
    stats.month.visitors > 0
      ? Math.round((stats.bookings.month / stats.month.visitors) * 100)
      : 0;
  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.views));
  const deviceTotal = stats.devices.reduce((s, d) => s + d.count, 0);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-xs text-muted">
        Eigene, cookie-freie Zählung direkt auf der Website (ohne Bots, ohne
        Admin-Aufrufe). Die Zählung läuft seit dem heutigen Update — die Kurve
        füllt sich Tag für Tag.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RevenueStat
          label="Heute"
          value={`${stats.today.visitors}`}
          sub={`${stats.today.views} Aufrufe`}
        />
        <RevenueStat
          label="7 Tage"
          value={`${stats.week.visitors}`}
          sub={`${stats.week.views} Aufrufe`}
        />
        <RevenueStat
          label="30 Tage"
          value={`${stats.month.visitors}`}
          sub={`${stats.month.views} Aufrufe`}
        />
        <RevenueStat
          label="Buchungsquote"
          value={`${conversion} %`}
          sub={`${stats.bookings.month} Buchungen / 30 Tage`}
        />
      </div>

      <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
        <h2 className="text-sm font-semibold">Besucher pro Tag (30 Tage)</h2>
        <div className="mt-4 flex items-end gap-[3px]" style={{ height: "150px" }}>
          {stats.daily.map((d) => {
            const h =
              d.views > 0
                ? Math.max(6, Math.round((d.views / maxDaily) * 120))
                : 2;
            return (
              <div
                key={d.day}
                className="group relative flex-1 rounded-t bg-brand/70 transition-colors hover:bg-brand"
                style={{ height: `${h}px` }}
                title={`${formatDateLabel(new Date(`${d.day}T12:00:00Z`), "UTC")}: ${d.visitors} Besucher · ${d.views} Aufrufe`}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>vor 30 Tagen</span>
          <span>heute</span>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
          <h2 className="text-sm font-semibold">Meistbesuchte Seiten</h2>
          {stats.topPaths.length === 0 ? (
            <p className="mt-2 text-xs text-muted">Noch keine Daten.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {stats.topPaths.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {PATH_LABELS[p.label] ?? p.label}
                  </span>
                  <span className="shrink-0 font-semibold">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
          <h2 className="text-sm font-semibold">Woher die Besucher kommen</h2>
          {stats.topReferrers.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Noch keine Daten — Direktaufrufe (Link/App/Lesezeichen) tauchen
              hier nicht auf, nur verweisende Seiten wie Instagram oder Google.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {stats.topReferrers.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="shrink-0 font-semibold">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {deviceTotal > 0 && (
        <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
          <h2 className="text-sm font-semibold">Geräte</h2>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface">
            {stats.devices.map((d, i) => (
              <div
                key={d.label}
                className={i === 0 ? "bg-brand" : "bg-blue-900"}
                style={{ width: `${(d.count / deviceTotal) * 100}%` }}
                title={`${d.label}: ${d.count}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
            {stats.devices.map((d, i) => (
              <span key={d.label} className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${i === 0 ? "bg-brand" : "bg-blue-900"}`}
                />
                {d.label}: {Math.round((d.count / deviceTotal) * 100)} %
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RevenueStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-background p-4 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-brand">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
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
  initialQuery,
  services,
  noShowThreshold,
  winbackWeeks,
  onChange,
}: {
  initialQuery?: string;
  services: Service[];
  noShowThreshold: number;
  winbackWeeks: number;
  onChange: () => void;
}) {
  const [customers, setCustomers] = useState<CustomerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [schedulingFor, setSchedulingFor] = useState<string | null>(null);
  const [newAppt, setNewAppt] = useState(false);
  // Manual booking blocklist (lowercase emails), loaded alongside customers.
  const [blocked, setBlocked] = useState<
    { email: string; reason: string }[]
  >([]);
  const [blockBusy, setBlockBusy] = useState(false);
  // Approval list: these emails book PENDING until the owner confirms.
  const [review, setReview] = useState<{ email: string; reason: string }[]>([]);

  function loadBlocklist() {
    fetch("/api/admin/blocklist")
      .then((r) => r.json())
      .then((d) =>
        setBlocked(
          (d.blocked ?? []).map(
            (b: { email: string; reason: string }) => ({
              email: b.email,
              reason: b.reason,
            }),
          ),
        ),
      )
      .catch(() => {});
    fetch("/api/admin/reviewlist")
      .then((r) => r.json())
      .then((d) =>
        setReview(
          (d.review ?? []).map((b: { email: string; reason: string }) => ({
            email: b.email,
            reason: b.reason,
          })),
        ),
      )
      .catch(() => {});
  }

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
    loadBlocklist();
    return () => {
      cancelled = true;
    };
  }, []);

  const blockedSet = new Set(blocked.map((b) => b.email));
  const reviewSet = new Set(review.map((r) => r.email));

  async function toggleReview(email: string, isOn: boolean) {
    if (!email) return;
    if (
      !isOn &&
      !window.confirm(
        `Buchungen von ${email} künftig erst nach deiner Freigabe bestätigen? Der Termin wird reserviert, gilt aber erst, wenn du ihn im Tagesplan freigibst.`,
      )
    ) {
      return;
    }
    setBlockBusy(true);
    try {
      await fetch("/api/admin/reviewlist", {
        method: isOn ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      loadBlocklist();
    } finally {
      setBlockBusy(false);
    }
  }

  async function toggleBlock(email: string, isBlocked: boolean) {
    if (!email) return;
    if (
      !isBlocked &&
      !window.confirm(
        `${email} für Online-Buchungen sperren? Der Kunde kann dann nur noch direkt im Shop buchen.`,
      )
    ) {
      return;
    }
    setBlockBusy(true);
    try {
      await fetch("/api/admin/blocklist", {
        method: isBlocked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      loadBlocklist();
    } finally {
      setBlockBusy(false);
    }
  }

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
        <h2 className="text-xl font-bold tracking-tight">
          Kunden{" "}
          {!loading && (
            <span className="text-base font-medium text-muted">
              ({q ? `${filtered.length} von ${customers.length}` : customers.length})
            </span>
          )}
        </h2>
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
                      {c.noShows > 0 &&
                        (noShowThreshold > 0 && c.noShows >= noShowThreshold ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
                            {c.noShows} No-Shows — automatisch gesperrt
                          </span>
                        ) : (
                          <span className="rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-700">
                            {noShowThreshold > 0
                              ? `${c.noShows} von ${noShowThreshold} No-Shows bis zur Sperre`
                              : `${c.noShows} nicht erschienen`}
                          </span>
                        ))}
                      <span className="rounded-full bg-surface px-2.5 py-1 text-muted">
                        {priceFull(c.spentCents)} ausgegeben
                      </span>
                      {c.lastStart && (
                        <span className="rounded-full bg-surface px-2.5 py-1 text-muted">
                          zuletzt {formatDateLabel(new Date(c.lastStart), tz)}
                        </span>
                      )}
                      {c.email && blockedSet.has(c.email.toLowerCase()) && (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
                          gesperrt
                        </span>
                      )}
                      {c.email && reviewSet.has(c.email.toLowerCase()) && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                          Freigabe nötig
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
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSchedulingFor(key)}
                          className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
                        >
                          + Termin eintragen
                        </button>
                        {c.email && (
                          <button
                            disabled={blockBusy}
                            onClick={() =>
                              toggleBlock(
                                c.email.toLowerCase(),
                                blockedSet.has(c.email.toLowerCase()),
                              )
                            }
                            className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 disabled:opacity-50 ${
                              blockedSet.has(c.email.toLowerCase())
                                ? "bg-red-50 text-red-700 ring-red-200"
                                : "text-muted ring-line hover:text-red-600 hover:ring-red-300"
                            }`}
                          >
                            {blockedSet.has(c.email.toLowerCase())
                              ? "Sperre aufheben"
                              : "Online-Buchung sperren"}
                          </button>
                        )}
                        {c.email && !blockedSet.has(c.email.toLowerCase()) && (
                          <button
                            disabled={blockBusy}
                            onClick={() =>
                              toggleReview(
                                c.email.toLowerCase(),
                                reviewSet.has(c.email.toLowerCase()),
                              )
                            }
                            className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 disabled:opacity-50 ${
                              reviewSet.has(c.email.toLowerCase())
                                ? "bg-amber-50 text-amber-700 ring-amber-200"
                                : "text-muted ring-line hover:text-amber-700 hover:ring-amber-300"
                            }`}
                          >
                            {reviewSet.has(c.email.toLowerCase())
                              ? "Freigabe-Pflicht aufheben"
                              : "Nur mit Freigabe"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <BroadcastCard />

      <WinbackCard initialWeeks={winbackWeeks} />

      {review.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <h3 className="text-sm font-semibold text-amber-800">
            Buchung nur mit Freigabe ({review.length})
          </h3>
          <p className="mt-1 text-xs text-amber-700/80">
            Buchungen dieser Adressen werden reserviert, gelten aber erst,
            wenn du sie im Tagesplan freigibst.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {review.map((r) => (
              <li
                key={r.email}
                className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm ring-1 ring-amber-100"
              >
                <span className="min-w-0 truncate">
                  {r.email}
                  {r.reason && <span className="text-muted"> · {r.reason}</span>}
                </span>
                <button
                  disabled={blockBusy}
                  onClick={() => toggleReview(r.email, true)}
                  className="shrink-0 text-xs text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                >
                  Aufheben
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
          <h3 className="text-sm font-semibold text-red-800">
            Gesperrte E-Mail-Adressen ({blocked.length})
          </h3>
          <p className="mt-1 text-xs text-red-700/80">
            Diese Adressen können nicht online buchen.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {blocked.map((b) => (
              <li
                key={b.email}
                className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm ring-1 ring-red-100"
              >
                <span className="min-w-0 truncate">
                  {b.email}
                  {b.reason && (
                    <span className="text-muted"> · {b.reason}</span>
                  )}
                </span>
                <button
                  disabled={blockBusy}
                  onClick={() => toggleBlock(b.email, true)}
                  className="shrink-0 text-xs text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                >
                  Entsperren
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Automatic win-back email: customers with no visit for N weeks (and no
// upcoming appointment) get one "we miss you" mail per lapse, sent by the
// daily cron. 0 = off.
function WinbackCard({ initialWeeks }: { initialWeeks: number }) {
  const [weeks, setWeeks] = useState(initialWeeks);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(value: number) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winbackWeeks: value }),
      });
      if (res.ok) {
        setWeeks(value);
        setMsg(value === 0 ? "Ausgeschaltet." : "Gespeichert.");
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error ?? "Speichern fehlgeschlagen.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold">💌 Rückhol-Mail</h3>
      <p className="mt-1 text-xs text-muted">
        Kunden, deren letzter Besuch länger her ist und die keinen neuen Termin
        haben, bekommen automatisch einmalig „Zeit für einen frischen
        Schnitt?“ mit Buchungslink (max. 20 pro Tag, mit Abmelde-Link).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={weeks}
          disabled={busy}
          onChange={(e) => save(Number(e.target.value))}
          className="rounded-lg border border-line bg-background px-2 py-2 text-sm"
        >
          <option value={0}>Aus</option>
          <option value={4}>nach 4 Wochen</option>
          <option value={6}>nach 6 Wochen</option>
          <option value={8}>nach 8 Wochen</option>
          <option value={12}>nach 12 Wochen</option>
        </select>
        {weeks > 0 && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            aktiv
          </span>
        )}
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </section>
  );
}

// Compose-and-send news email ("Rundmail") to every customer who ever booked,
// minus unsubscribed addresses. Every mail carries a personal opt-out link.
function BroadcastCard() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [optedOut, setOptedOut] = useState(0);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || count !== null) return;
    fetch("/api/admin/broadcast")
      .then((r) => r.json())
      .then((d) => {
        setCount(d.recipients ?? 0);
        setOptedOut(d.optedOut ?? 0);
      })
      .catch(() => {});
  }, [open, count]);

  async function sendBroadcast() {
    if (!subject.trim() || !message.trim()) {
      setError("Bitte Betreff und Nachricht ausfüllen.");
      return;
    }
    if (
      !window.confirm(
        `Rundmail "${subject.trim()}" jetzt an ${count ?? "alle"} Kunden senden? Das kann nicht rückgängig gemacht werden.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Versand fehlgeschlagen.");
        return;
      }
      setResult(
        `Gesendet an ${d.sent} von ${d.total} Kunden` +
          (d.failed ? ` — ${d.failed} fehlgeschlagen.` : "."),
      );
      setSubject("");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          📣 Rundmail an alle Kunden
          {count !== null && (
            <span className="font-medium text-muted"> ({count} Empfänger)</span>
          )}
        </span>
        <span className="text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <p className="text-xs text-muted">
            Für News und Ankündigungen, z. B. Betriebsferien oder geänderte
            Zeiten. Geht an alle Kunden, die je gebucht haben
            {optedOut > 0 ? ` (${optedOut} abgemeldet)` : ""}. Jede E-Mail
            enthält automatisch einen Abmelde-Link.
          </p>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            placeholder="Betreff, z. B. Betriebsferien vom 13.–21. Juli"
            className="mt-3 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={5000}
            rows={6}
            placeholder={
              "Deine Nachricht — Zeilenumbrüche werden übernommen.\n\nz. B.: Liebe Kunden, vom 13. bis 21. Juli bleibt der Laden geschlossen. Sichert euch jetzt noch einen der letzten Termine davor!"
            }
            className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              disabled={busy || !subject.trim() || !message.trim()}
              onClick={sendBroadcast}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? "Wird gesendet…"
                : `An ${count ?? "…"} Kunden senden`}
            </button>
            {result && <span className="text-xs text-green-700">{result}</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </section>
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
  cancelDeadlineHours,
  maxActiveBookingsPerEmail,
  noShowBlockThreshold,
  ownerCopyEmails,
  onChange,
}: {
  hours: DayHours[];
  timeOff: TimeOff[];
  specialDays: SpecialDay[];
  bookingWindowDays: number;
  reminderEnabled: boolean;
  reminderLeadHours: number;
  cancelDeadlineHours: number;
  maxActiveBookingsPerEmail: number;
  noShowBlockThreshold: number;
  ownerCopyEmails: boolean;
  onChange: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col gap-8">
      <BookingWindowCard days={bookingWindowDays} onChange={onChange} />
      <BookingLimitCard max={maxActiveBookingsPerEmail} onChange={onChange} />
      <NoShowCard threshold={noShowBlockThreshold} onChange={onChange} />
      <CancelDeadlineCard hours={cancelDeadlineHours} onChange={onChange} />
      <RemindersCard
        enabled={reminderEnabled}
        leadHours={reminderLeadHours}
        onChange={onChange}
      />
      <OwnerCopyCard enabled={ownerCopyEmails} onChange={onChange} />
      <PushCard />
      <HoursCard hours={hours} onChange={onChange} />
      <SpecialDaysCard specialDays={specialDays} onChange={onChange} />
      <TimeOffCard timeOff={timeOff} onChange={onChange} />
    </div>
  );
}

// "Mail-Sparmodus": owner-copy mails (new booking, waitlist, cancellations)
// on/off. Off nearly halves the daily Resend volume — push covers the events.
function OwnerCopyCard({
  enabled: initialEnabled,
  onChange,
}: {
  enabled: boolean;
  onChange: () => void;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerCopyEmails: enabled }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Gespeichert." : (d.error ?? "Fehler."));
      if (res.ok) onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <h2 className="text-sm font-semibold">Kopie-Mails an dich</h2>
      <p className="mt-1 text-xs text-muted">
        Bei jeder Buchung, Absage oder Wartelisten-Anfrage bekommst du eine
        Kopie per E-Mail. Im Mail-Sparmodus (Aus) entfallen diese Kopien — du
        bekommst weiterhin jede Push-Nachricht. Das halbiert fast den täglichen
        E-Mail-Verbrauch (Resend-Limit: 100/Tag). Kunden-Mails sind nicht
        betroffen.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <select
          value={enabled ? "1" : "0"}
          onChange={(e) => setEnabled(e.target.value === "1")}
          className="rounded-lg border border-line bg-background px-3 py-2"
        >
          <option value="1">An — Kopie per E-Mail + Push</option>
          <option value="0">Aus — nur Push (Mail-Sparmodus)</option>
        </select>
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

// Cap on simultaneous upcoming bookings per customer email (anti-hoarding).
function BookingLimitCard({
  max: initialMax,
  onChange,
}: {
  max: number;
  onChange: () => void;
}) {
  const [max, setMax] = useState(initialMax);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const OPTIONS = [
    { v: 0, label: "Unbegrenzt" },
    { v: 1, label: "1 Termin gleichzeitig" },
    { v: 2, label: "2 Termine gleichzeitig" },
    { v: 3, label: "3 Termine gleichzeitig" },
  ];

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxActiveBookingsPerEmail: max }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Gespeichert." : (d.error ?? "Fehler."));
      if (res.ok) onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <h2 className="text-sm font-semibold">Buchungslimit pro Kunde</h2>
      <p className="mt-1 text-xs text-muted">
        Wie viele offene Termine eine E-Mail-Adresse gleichzeitig haben darf —
        verhindert, dass einzelne Kunden viele Slots blockieren. Hinweis: Bei
        Limit 1 funktioniert auch das Anhängen eines zweiten Termins mit
        derselben E-Mail nicht mehr.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <select
          value={max}
          onChange={(e) => setMax(Number(e.target.value))}
          className="rounded-lg border border-line bg-background px-3 py-2"
        >
          {OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
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

// After how many no-shows an email loses online booking (0 = never).
function NoShowCard({
  threshold: initialThreshold,
  onChange,
}: {
  threshold: number;
  onChange: () => void;
}) {
  const [threshold, setThreshold] = useState(initialThreshold);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const OPTIONS = [
    { v: 0, label: "Nie automatisch sperren" },
    { v: 1, label: "Nach 1 No-Show" },
    { v: 2, label: "Nach 2 No-Shows" },
    { v: 3, label: "Nach 3 No-Shows" },
  ];

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noShowBlockThreshold: threshold }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Gespeichert." : (d.error ?? "Fehler."));
      if (res.ok) onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <h2 className="text-sm font-semibold">No-Show-Sperre</h2>
      <p className="mt-1 text-xs text-muted">
        Ab wie vielen „nicht erschienen“-Terminen eine E-Mail-Adresse
        automatisch keine Online-Buchung mehr machen darf. Manuell sperren
        kannst du im Kunden-Tab jederzeit zusätzlich.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <select
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="rounded-lg border border-line bg-background px-3 py-2"
        >
          {OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
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

// Until how many hours before the start customers may cancel/reschedule online.
function CancelDeadlineCard({
  hours: initialHours,
  onChange,
}: {
  hours: number;
  onChange: () => void;
}) {
  const [hours, setHours] = useState(initialHours);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const OPTIONS = [
    { v: 0, label: "Bis zum Termin (keine Frist)" },
    { v: 2, label: "Bis 2 Stunden vorher" },
    { v: 6, label: "Bis 6 Stunden vorher" },
    { v: 12, label: "Bis 12 Stunden vorher" },
    { v: 24, label: "Bis 24 Stunden vorher" },
    { v: 48, label: "Bis 48 Stunden vorher" },
  ];

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelDeadlineHours: hours }),
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
      <h2 className="text-sm font-semibold">Stornofrist</h2>
      <p className="mt-1 text-xs text-muted">
        Bis wann Kunden ihren Termin online absagen oder verschieben können.
        Danach geht es nur noch direkt über dich.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="rounded-lg border border-line bg-background px-3 py-2"
        >
          {OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
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

  // Versand läuft einmal täglich (Vercel-Cron) — Werte unter 24 h würden
  // Termine später am Tag stillschweigend verpassen, daher nur Tages-Optionen.
  const LEAD_OPTIONS = [
    { v: 24, label: "1 Tag vorher" },
    { v: 48, label: "2 Tage vorher" },
    { v: 72, label: "3 Tage vorher" },
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

// Web-Push payloads need the VAPID public key as a Uint8Array (backed by a
// plain ArrayBuffer so it satisfies the DOM BufferSource type).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Enable/disable push notifications for new bookings on THIS device (the
// subscription lives in the browser; the server stores its endpoint).
function PushCard() {
  const [supported, setSupported] = useState(true);
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only feature detection (browser APIs unavailable during SSR) */
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setSupported(false);
      return;
    }
    fetch("/api/admin/push")
      .then((r) => r.json())
      .then((d) => {
        setServerEnabled(Boolean(d.enabled));
        setPublicKey(d.publicKey ?? "");
      })
      .catch(() => setServerEnabled(false));
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg("Benachrichtigungen wurden im Browser nicht erlaubt.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error ?? "Aktivierung fehlgeschlagen.");
        return;
      }
      setSubscribed(true);
      setMsg("Aktiviert — du bekommst jetzt Push bei neuen Buchungen.");
    } catch {
      setMsg("Aktivierung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/admin/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("Deaktiviert.");
    } catch {
      setMsg("Deaktivierung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-background p-5 shadow-soft">
      <h2 className="text-sm font-semibold">Push-Benachrichtigungen</h2>
      <p className="mt-1 text-xs text-muted">
        Sofortige Benachrichtigung auf diesem Gerät bei neuen Buchungen,
        Verschiebungen und Stornierungen. Funktioniert am besten mit der
        installierten Admin-App.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {!supported ? (
          <span className="text-muted">
            Dieser Browser unterstützt keine Push-Benachrichtigungen.
          </span>
        ) : serverEnabled === false ? (
          <span className="text-muted">
            Auf dem Server nicht konfiguriert (VAPID-Schlüssel fehlen).
          </span>
        ) : subscribed ? (
          <button
            onClick={disable}
            disabled={busy}
            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "…" : "Auf diesem Gerät deaktivieren"}
          </button>
        ) : (
          <button
            onClick={enable}
            disabled={busy || !publicKey}
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          >
            {busy ? "…" : "Auf diesem Gerät aktivieren"}
          </button>
        )}
        {msg && <span className="text-sm text-muted">{msg}</span>}
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
  const [info, setInfo] = useState<string | null>(null);
  // Bookings that fall inside the requested range (server responded 409) —
  // the admin decides whether to cancel them or keep them.
  const [conflicts, setConflicts] = useState<
    | {
        id: string;
        customerName: string;
        hasEmail: boolean;
        serviceName: string;
        start: string;
      }[]
    | null
  >(null);

  function resetForm() {
    setStart("");
    setEnd("");
    setReason("");
    setRangeMode(false);
    setEditingId(null);
    setError(null);
    setConflicts(null);
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

  async function save(onConflict: "abort" | "cancel" | "keep") {
    const finalEnd = rangeMode && end ? end : start;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const url = editingId
        ? `/api/admin/timeoff/${editingId}`
        : "/api/admin/timeoff";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: start,
          endDate: finalEnd,
          reason,
          onConflict,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Existing bookings in the range — surface them and let the admin pick.
        if (res.status === 409 && Array.isArray(d.conflicts)) {
          setConflicts(d.conflicts);
          return;
        }
        setError(d.error ?? "Konnte nicht gespeichert werden.");
        return;
      }
      if (onConflict === "cancel" && typeof d.cancelled === "number") {
        setInfo(
          `Gespeichert — ${d.cancelled} Termin(e) abgesagt, ${d.notified} Kunde(n) benachrichtigt.`,
        );
      }
      resetForm();
      onChange();
    } finally {
      setSaving(false);
    }
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
    await save("abort");
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
        {info && (
          <p className="text-sm text-emerald-700 sm:col-span-2">{info}</p>
        )}

        {conflicts && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:col-span-2">
            <p className="text-sm font-semibold text-amber-800">
              In diesem Zeitraum gibt es {conflicts.length} gebuchte
              Termin{conflicts.length === 1 ? "" : "e"}:
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-900">
              {conflicts.map((c) => (
                <li key={c.id}>
                  {formatDateTimeLabel(new Date(c.start), tz)} — {c.customerName}{" "}
                  ({c.serviceName}
                  {c.hasEmail ? "" : ", keine E-Mail"})
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-800">
              Was soll mit den Terminen passieren?
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save("cancel")}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Termine absagen & Kunden informieren
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save("keep")}
                className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
              >
                Trotzdem sperren, Termine behalten
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setConflicts(null)}
                className="rounded-lg border border-line px-3 py-2 text-xs"
              >
                Abbrechen
              </button>
            </div>
          </div>
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
