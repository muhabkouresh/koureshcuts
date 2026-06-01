"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import {
  formatDateLabel,
  formatDateTimeLabel,
  minutesToHHMM,
} from "@/lib/time";

type Appointment = {
  id: string;
  serviceName: string;
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

type Data = {
  appointments: Appointment[];
  hours: DayHours[];
  timeOff: TimeOff[];
};

const tz = siteConfig.timezone;
const WEEKDAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
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

export default function AdminDashboard({ data }: { data: Data }) {
  const router = useRouter();
  const [tab, setTab] = useState<"appointments" | "availability">(
    "appointments",
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
          {siteConfig.name} · Admin
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
          onClick={() => setTab("appointments")}
          className={`rounded-full px-4 py-1.5 ${
            tab === "appointments" ? "bg-foreground text-background" : "text-muted"
          }`}
        >
          Termine
        </button>
        <button
          onClick={() => setTab("availability")}
          className={`rounded-full px-4 py-1.5 ${
            tab === "availability" ? "bg-foreground text-background" : "text-muted"
          }`}
        >
          Verfügbarkeit
        </button>
      </div>

      {tab === "appointments" ? (
        <Appointments
          appointments={data.appointments}
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

function Appointments({
  appointments,
  onChange,
}: {
  appointments: Appointment[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  if (appointments.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted">
        Noch keine bevorstehenden Termine.
      </p>
    );
  }

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {appointments.map((a) => (
        <li
          key={a.id}
          className="rounded-2xl border border-line bg-background p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                {a.serviceName}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle(
                    a.status,
                  )}`}
                >
                  {STATUS_LABEL[a.status] ?? a.status.toLowerCase()}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {formatDateTimeLabel(new Date(a.start), tz)}
              </p>
              <p className="mt-2 text-sm">
                {a.customerName}
                {a.customerPhone && (
                  <>
                    {" · "}
                    <a className="underline" href={`tel:${a.customerPhone}`}>
                      {a.customerPhone}
                    </a>
                  </>
                )}
                {" · "}
                <a className="underline" href={`mailto:${a.customerEmail}`}>
                  {a.customerEmail}
                </a>
              </p>
              {a.notes && (
                <p className="mt-1 text-sm text-muted">Notiz: {a.notes}</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {a.status !== "CANCELLED" && (
              <button
                disabled={busy === a.id}
                onClick={() => setStatus(a.id, "CANCELLED")}
                className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-red-400 hover:text-red-600 disabled:opacity-50"
              >
                Stornieren
              </button>
            )}
            {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
              <button
                disabled={busy === a.id}
                onClick={() => setStatus(a.id, "COMPLETED")}
                className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-foreground disabled:opacity-50"
              >
                Erledigt
              </button>
            )}
            {a.status === "CANCELLED" && (
              <button
                disabled={busy === a.id}
                onClick={() => setStatus(a.id, "CONFIRMED")}
                className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-foreground disabled:opacity-50"
              >
                Wiederherstellen
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

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
        <div className="mt-4 flex flex-col gap-2">
          {draft.map((d) => (
            <div
              key={d.dayOfWeek}
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <span className="w-10 font-medium">
                {WEEKDAY_NAMES[d.dayOfWeek]}
              </span>
              <label className="flex items-center gap-1.5 text-muted">
                <input
                  type="checkbox"
                  checked={!d.isClosed}
                  onChange={(e) =>
                    updateDay(d.dayOfWeek, { isClosed: !e.target.checked })
                  }
                />
                Geöffnet
              </label>
              <input
                type="time"
                disabled={d.isClosed}
                value={minutesToHHMM(d.openMinute)}
                onChange={(e) =>
                  updateDay(d.dayOfWeek, {
                    openMinute: hhmmToMinutes(e.target.value),
                  })
                }
                className="rounded-lg border border-line bg-background px-2 py-1 disabled:opacity-40"
              />
              <span className="text-muted">–</span>
              <input
                type="time"
                disabled={d.isClosed}
                value={minutesToHHMM(d.closeMinute)}
                onChange={(e) =>
                  updateDay(d.dayOfWeek, {
                    closeMinute: hhmmToMinutes(e.target.value),
                  })
                }
                className="rounded-lg border border-line bg-background px-2 py-1 disabled:opacity-40"
              />
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
                  {formatDateLabel(new Date(t.startDate), tz)} —{" "}
                  {/* endDate is stored as next-midnight; show the last full day */}
                  {formatDateLabel(new Date(new Date(t.endDate).getTime() - 1), tz)}
                  {t.reason && (
                    <span className="text-muted"> · {t.reason}</span>
                  )}
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
