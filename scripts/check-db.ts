import { prisma } from "../src/lib/prisma";

async function main() {
  const services = await prisma.service.count();
  const hours = await prisma.businessHours.count();
  const list = await prisma.service.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(`services=${services} hours=${hours}`);
  for (const s of list) {
    console.log(` - ${s.name} | ${s.durationMinutes}min | $${(s.priceCents / 100).toFixed(2)}`);
  }
}

main().finally(() => prisma.$disconnect());
