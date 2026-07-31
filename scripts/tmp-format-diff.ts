// Vergleicht die neue, bibliotheksfreie Formatierung Zeichen für Zeichen mit
// der bisherigen date-fns-Variante. Jede Abweichung wäre ein sichtbarer Fehler
// in Mails, Kalender und Buchungsablauf.
import { formatInTimeZone } from "date-fns-tz";
import { de } from "date-fns/locale";
import * as neu from "../src/lib/timeFormat";

const LOCALE = { locale: de };
const tz = "Europe/Berlin";

const alt = {
  formatTimeLabel: (d: Date, z: string) =>
    formatInTimeZone(d, z, "HH:mm 'Uhr'", LOCALE),
  formatClock: (d: Date, z: string) => formatInTimeZone(d, z, "HH:mm", LOCALE),
  formatDateTimeLabel: (d: Date, z: string) =>
    formatInTimeZone(d, z, "EE, dd.MM.yyyy '•' HH:mm 'Uhr'", LOCALE),
  formatDateLabel: (d: Date, z: string) =>
    formatInTimeZone(d, z, "EE, dd.MM.yyyy", LOCALE),
  formatLongDate: (d: Date, z: string) =>
    formatInTimeZone(d, z, "EEEE, d. MMMM yyyy", LOCALE),
  longDateFromStr: (s: string) =>
    formatInTimeZone(new Date(`${s}T12:00:00Z`), "UTC", "EEEE, d. MMMM yyyy", LOCALE),
  todayInTz: (z: string) => formatInTimeZone(new Date(), z, "yyyy-MM-dd"),
  dateKey: (d: Date, z: string) => formatInTimeZone(d, z, "yyyy-MM-dd"),
  monthLabel: (y: number, m0: number) =>
    formatInTimeZone(new Date(Date.UTC(y, m0, 1, 12)), "UTC", "MMMM yyyy", LOCALE),
};

let checks = 0;
let bad = 0;
function eq(name: string, a: string, b: string, ctx: string) {
  checks++;
  if (a !== b) {
    bad++;
    if (bad <= 15) console.log(`  ABWEICHUNG ${name} @ ${ctx}\n    alt: "${a}"\n    neu: "${b}"`);
  }
}

function main() {
  // Zeitpunkte: jede Stunde über ein volles Jahr + beide Zeitumstellungen.
  const start = Date.UTC(2026, 0, 1, 0, 0);
  const instants: Date[] = [];
  for (let h = 0; h < 365 * 24; h += 7) instants.push(new Date(start + h * 3_600_000));
  // Zeitumstellung 2026: 29.03. (Beginn Sommerzeit), 25.10. (Ende) — minutengenau.
  for (const dst of [Date.UTC(2026, 2, 29, 0, 0), Date.UTC(2026, 9, 25, 0, 0)]) {
    for (let m = -180; m <= 300; m += 5) instants.push(new Date(dst + m * 60_000));
  }
  // Mitternacht in Berlin, wo hourCycle-Fehler ("24:00") auffallen würden.
  for (let d = 0; d < 365; d++) {
    instants.push(new Date(Date.UTC(2026, 0, 1, 22, 0) + d * 86_400_000));
    instants.push(new Date(Date.UTC(2026, 0, 1, 23, 0) + d * 86_400_000));
  }

  for (const d of instants) {
    const ctx = d.toISOString();
    eq("formatTimeLabel", alt.formatTimeLabel(d, tz), neu.formatTimeLabel(d, tz), ctx);
    eq("formatClock", alt.formatClock(d, tz), neu.formatClock(d, tz), ctx);
    eq("formatDateTimeLabel", alt.formatDateTimeLabel(d, tz), neu.formatDateTimeLabel(d, tz), ctx);
    eq("formatDateLabel", alt.formatDateLabel(d, tz), neu.formatDateLabel(d, tz), ctx);
    eq("formatLongDate", alt.formatLongDate(d, tz), neu.formatLongDate(d, tz), ctx);
    eq("dateKey", alt.dateKey(d, tz), neu.dateKey(d, tz), ctx);
    // UTC als zweite Zeitzone (wird für Kalender-Labels benutzt)
    eq("dateKey/UTC", alt.dateKey(d, "UTC"), neu.dateKey(d, "UTC"), ctx);
    eq("formatClock/UTC", alt.formatClock(d, "UTC"), neu.formatClock(d, "UTC"), ctx);
  }

  // Datums-Strings über 3 Jahre
  for (let i = 0; i < 1100; i++) {
    const ds = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    eq("longDateFromStr", alt.longDateFromStr(ds), neu.longDateFromStr(ds), ds);
  }

  // Monatsnamen
  for (let y = 2024; y <= 2029; y++)
    for (let m = 0; m < 12; m++)
      eq("monthLabel", alt.monthLabel(y, m), neu.monthLabel(y, m), `${y}-${m}`);

  eq("todayInTz", alt.todayInTz(tz), neu.todayInTz(tz), "jetzt");

  console.log(
    `\n${checks} Vergleiche · ${bad === 0 ? "KEINE Abweichung" : `${bad} ABWEICHUNGEN`}`,
  );
  if (bad > 0) process.exitCode = 1;
}

main();
