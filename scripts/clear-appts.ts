// Dev helper: delete all appointments (keeps services/hours).
import { prisma } from "../src/lib/prisma";

prisma.appointment
  .deleteMany()
  .then((r) => console.log(`Deleted ${r.count} appointments.`))
  .finally(() => prisma.$disconnect());
