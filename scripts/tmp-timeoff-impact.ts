import { PrismaClient } from "@prisma/client";
import { getAvailability } from "../src/lib/availability";
import { dateKey, addDaysToDateStr } from "../src/lib/time";

const prisma = new PrismaClient();
const tz = "Europe/Berlin";
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

async function main() {
  const services = await prisma.service.findMany({ where: { active: true } });
  const sid = services[0].id;
  const off = await prisma.timeOff.findMany({
    where: { endDate: { gte: new Date() } },
    orderBy: { startDate: "asc" },
  });

  console.log("Erster Tag NACH jeder Schließung — vorher gesperrt, jetzt:");
  let recovered = 0;
  for (const t of off) {
    // endDate ist exklusiv = Mitternacht des Folgetages.
    const backDs = dateKey(t.endDate, tz);
    const lastClosed = addDaysToDateStr(backDs, -1);
    const wd = WD[new Date(`${backDs}T12:00:00Z`).getUTCDay()];
    const hours = await prisma.businessHours.findUnique({
      where: { dayOfWeek: new Date(`${backDs}T12:00:00Z`).getUTCDay() },
    });
    const av = await getAvailability(sid, backDs);
    recovered += av.slots.length;
    console.log(
      `  geschlossen bis ${lastClosed} → ${wd} ${backDs}: ` +
        (hours?.isClosed
          ? "regulär geschlossen, kein Verlust"
          : `${av.slots.length} Zeiten wieder buchbar`),
    );
  }
  console.log(`\nInsgesamt wieder buchbar: ${recovered} Termine`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
