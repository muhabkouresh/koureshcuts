// One-off: repair time-off rows saved with the old 24:00 bug (end == start).
// For such single-day blocks, the correct end is start + 24h (next-day midnight).
import { prisma } from "../src/lib/prisma";

async function main() {
  const all = await prisma.timeOff.findMany();
  let fixed = 0;
  for (const t of all) {
    if (t.endDate.getTime() <= t.startDate.getTime()) {
      await prisma.timeOff.update({
        where: { id: t.id },
        data: { endDate: new Date(t.startDate.getTime() + 24 * 60 * 60 * 1000) },
      });
      fixed++;
    }
  }
  console.log(`timeoff total ${all.length}, repaired ${fixed}`);
}

main().finally(() => prisma.$disconnect());
