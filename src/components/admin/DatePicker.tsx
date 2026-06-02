"use client";

import { useState } from "react";
import { siteConfig } from "@/config/site";
import {
  daysInMonth,
  firstWeekdayMondayFirst,
  monthLabel,
  toDateStr,
  todayInTz,
} from "@/lib/time";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const tz = siteConfig.timezone;

/** "YYYY-MM-DD" -> "TT.MM.JJJJ" (or placeholder when empty). */
function deLabel(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "TT.MM.JJJJ";
  const [y, m, d] = v.split("-");
  return `${d}.${m}.${y}`;
}

// Custom German date picker (fixed TT.MM.JJJJ format, independent of the
// browser locale). Value is exchanged as "YYYY-MM-DD".
export default function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = todayInTz(tz);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
  const [yPart, mPart] = base.split("-").map(Number);
  const [year, setYear] = useState(yPart);
  const [month0, setMonth0] = useState(mPart - 1);

  function openCal() {
    const b = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
    const [y, m] = b.split("-").map(Number);
    setYear(y);
    setMonth0(m - 1);
    setOpen(true);
  }

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
    <div className="relative">
      <button
        type="button"
        onClick={openCal}
        className="w-full rounded-lg border border-line bg-background px-3 py-2 text-left tabular-nums hover:border-foreground"
      >
        {deLabel(value)}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-line bg-background p-3 shadow-lg">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Vorheriger Monat"
                className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-line hover:ring-foreground"
              >
                ‹
              </button>
              <span className="text-sm font-bold">
                {monthLabel(year, month0)}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Nächster Monat"
                className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-line hover:ring-foreground"
              >
                ›
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-0.5">
                  {w}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((day, idx) => {
                if (day === null) return <div key={`b${idx}`} />;
                const ds = toDateStr(year, month0, day);
                const selected = ds === value;
                const isToday = ds === today;
                return (
                  <button
                    key={ds}
                    type="button"
                    onClick={() => {
                      onChange(ds);
                      setOpen(false);
                    }}
                    className={`aspect-square rounded-lg text-sm transition-colors ${
                      selected
                        ? "bg-foreground font-bold text-background"
                        : isToday
                          ? "ring-1 ring-foreground/30 hover:bg-surface"
                          : "hover:bg-surface"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
