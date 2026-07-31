import { PrismaClient } from "@prisma/client";
import { getAvailability, getMonthAvailability } from "../src/lib/availability";
import { addDaysToDateStr, todayInTz } from "../src/lib/time";
import { siteConfig } from "../src/config/site";

const prisma = new PrismaClient();
const tz = siteConfig.timezone;

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function main() {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
  });
  const win = settings!.bookingWindowDays;
  const today = todayInTz(tz);
  const services = await prisma.service.findMany({ where: { active: true } });
  const sid = services[0].id;

  console.log(
    `Heute ${today}, ${new Date().toLocaleTimeString("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit" })} Uhr · Fenster ${win} Tage`,
  );
  console.log(`Letzter buchbarer Tag: ${addDaysToDateStr(today, win)}\n`);

  for (let i = win - 1; i <= win + 2; i++) {
    const ds = addDaysToDateStr(today, i);
    const av = await getAvailability(sid, ds);
    const wd = new Date(`${ds}T12:00:00Z`).toLocaleDateString("de-DE", {
      weekday: "short",
      timeZone: "UTC",
    });
    const soll = i <= win ? "im Fenster" : "AUSSERHALB";
    console.log(
      `Tag +${String(i).padStart(2)} ${wd} ${ds} (${soll}): ${av.slots.length} frei` +
        (av.slots.length ? ` → ${av.slots.map((s) => clock(s.start)).join(", ")}` : ""),
    );
  }

  console.log("\n--- Monatsansicht (was der Kalender anzeigt) ---");
  const [y, m] = today.split("-").map(Number);
  for (const [yy, mm] of [
    [y, m - 1],
    [m === 12 ? y + 1 : y, m === 12 ? 0 : m],
  ] as [number, number][]) {
    const mo = await getMonthAvailability(sid, yy, mm);
    console.log(
      `${String(mm + 1).padStart(2, "0")}/${yy}: buchbar ${mo.days.join(", ") || "—"} | ausgebucht ${mo.full.join(", ") || "—"}`,
    );
  }

  // Harte Zusicherung: kein Tag NACH dem letzten erlaubten darf buchbar sein
  // (außer ein vom Inhaber geöffneter Extra-Tag).
  const last = addDaysToDateStr(today, win);
  const extra = await prisma.specialDay.findMany({
    where: { isPublic: true, date: { gte: new Date(`${last}T00:00:00Z`) } },
    select: { date: true },
  });
  const extraDays = new Set(extra.map((e) => e.date.toISOString().slice(0, 10)));
  let leaks = 0;
  for (let i = win + 1; i <= win + 10; i++) {
    const ds = addDaysToDateStr(today, i);
    if (extraDays.has(ds)) continue;
    const av = await getAvailability(sid, ds);
    if (av.slots.length > 0) {
      leaks++;
      console.log(`  LECK: ${ds} liegt außerhalb, hat aber ${av.slots.length} Slots`);
    }
  }
  console.log(
    `\nTage nach dem Fenster mit Slots: ${leaks} (muss 0 sein)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
