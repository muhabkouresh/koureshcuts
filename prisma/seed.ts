import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Real services from the live Kouresh_cuts site.
const services = [
  {
    name: "Haarschnitt",
    description: "",
    durationMinutes: 30,
    priceCents: 1500,
    sortOrder: 1,
  },
  {
    name: "Haarschnitt + Bart",
    description: "",
    durationMinutes: 30,
    priceCents: 2000,
    sortOrder: 2,
  },
];

// Weekly hours (minutes from midnight). 0 = Sunday … 6 = Saturday.
// Placeholder — adjust live in the admin dashboard.
const hours = [
  { dayOfWeek: 0, isClosed: true, openMinute: 600, closeMinute: 1080 }, // Sun closed
  { dayOfWeek: 1, isClosed: false, openMinute: 600, closeMinute: 1140 }, // Mon 10–19
  { dayOfWeek: 2, isClosed: false, openMinute: 600, closeMinute: 1140 }, // Tue 10–19
  { dayOfWeek: 3, isClosed: false, openMinute: 600, closeMinute: 1140 }, // Wed 10–19
  { dayOfWeek: 4, isClosed: false, openMinute: 600, closeMinute: 1140 }, // Thu 10–19
  { dayOfWeek: 5, isClosed: false, openMinute: 600, closeMinute: 1200 }, // Fri 10–20
  { dayOfWeek: 6, isClosed: false, openMinute: 600, closeMinute: 1080 }, // Sat 10–18
];

async function main() {
  // Settings singleton (booking window default: 4 weeks = 28 days).
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", bookingWindowDays: 28 },
  });
  console.log("Seeded settings (booking window).");

  for (const h of hours) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: h.dayOfWeek },
      update: h,
      create: h,
    });
  }
  console.log(`Seeded ${hours.length} business-hours rows.`);

  // Replace services with the real set. Safe on a fresh DB (no appointments).
  // If appointments already reference services, skip the wipe.
  const apptCount = await prisma.appointment.count();
  if (apptCount === 0) {
    await prisma.service.deleteMany();
    await prisma.service.createMany({ data: services });
    console.log(`Seeded ${services.length} services.`);
  } else {
    console.log(
      `Skipped service reset (${apptCount} appointments exist). Edit services manually.`,
    );
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
