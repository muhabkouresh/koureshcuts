// Dev helper: wipe all bookings + services, then re-run the seed.
// Use only in development to reset to a clean placeholder state.
import { prisma } from "../src/lib/prisma";

async function main() {
  const appts = await prisma.appointment.deleteMany();
  const svcs = await prisma.service.deleteMany();
  console.log(`Deleted ${appts.count} appointments, ${svcs.count} services.`);
}

main().finally(() => prisma.$disconnect());
