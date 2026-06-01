import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Placeholder services — edit names/prices/durations to match your shop.
const services = [
  {
    name: "Classic Haircut",
    description: "Scissor or clipper cut, styled and finished.",
    durationMinutes: 30,
    priceCents: 3000,
    sortOrder: 1,
  },
  {
    name: "Skin Fade",
    description: "Precision fade blended to the skin, sharp and clean.",
    durationMinutes: 45,
    priceCents: 3500,
    sortOrder: 2,
  },
  {
    name: "Beard Trim & Shape",
    description: "Beard lined up, shaped, and conditioned.",
    durationMinutes: 20,
    priceCents: 1500,
    sortOrder: 3,
  },
  {
    name: "Cut + Beard",
    description: "Full haircut paired with a beard trim and line-up.",
    durationMinutes: 60,
    priceCents: 4500,
    sortOrder: 4,
  },
  {
    name: "Kids Cut (under 12)",
    description: "Haircut for the little ones.",
    durationMinutes: 30,
    priceCents: 2000,
    sortOrder: 5,
  },
];

// Weekly hours. minutes-from-midnight. 0 = Sunday … 6 = Saturday.
const hours = [
  { dayOfWeek: 0, isClosed: true, openMinute: 540, closeMinute: 1020 }, // Sun closed
  { dayOfWeek: 1, isClosed: false, openMinute: 540, closeMinute: 1080 }, // Mon 9–18
  { dayOfWeek: 2, isClosed: false, openMinute: 540, closeMinute: 1080 }, // Tue 9–18
  { dayOfWeek: 3, isClosed: false, openMinute: 540, closeMinute: 1080 }, // Wed 9–18
  { dayOfWeek: 4, isClosed: false, openMinute: 540, closeMinute: 1200 }, // Thu 9–20
  { dayOfWeek: 5, isClosed: false, openMinute: 540, closeMinute: 1200 }, // Fri 9–20
  { dayOfWeek: 6, isClosed: false, openMinute: 540, closeMinute: 960 }, // Sat 9–16
];

async function main() {
  // Business hours — upsert by weekday so re-seeding is idempotent.
  for (const h of hours) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: h.dayOfWeek },
      update: h,
      create: h,
    });
  }
  console.log(`Seeded ${hours.length} business-hours rows.`);

  // Services — only seed if none exist yet, to avoid duplicates / FK issues.
  const existing = await prisma.service.count();
  if (existing === 0) {
    await prisma.service.createMany({ data: services });
    console.log(`Seeded ${services.length} services.`);
  } else {
    console.log(`Skipped services (${existing} already present).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
