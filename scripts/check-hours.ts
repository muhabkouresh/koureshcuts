import { prisma } from "../src/lib/prisma";

const NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

async function main() {
  const hours = await prisma.businessHours.findMany({
    orderBy: { dayOfWeek: "asc" },
  });
  for (const h of hours) {
    const hhmm = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    console.log(
      `${h.dayOfWeek} ${NAMES[h.dayOfWeek]}  ${h.isClosed ? "GESCHLOSSEN" : `${hhmm(h.openMinute)}-${hhmm(h.closeMinute)}`}`,
    );
  }
  const s = await prisma.settings.findUnique({ where: { id: "singleton" } });
  console.log("bookingWindowDays =", s?.bookingWindowDays);
}

main().finally(() => prisma.$disconnect());
