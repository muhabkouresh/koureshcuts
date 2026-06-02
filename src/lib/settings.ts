import { prisma } from "./prisma";

// Editable shop settings (single row).

const SINGLETON = "singleton";
const DEFAULT_WINDOW_DAYS = 28; // 4 weeks

export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: SINGLETON } });
  if (existing) return existing;
  return prisma.settings.create({
    data: { id: SINGLETON, bookingWindowDays: DEFAULT_WINDOW_DAYS },
  });
}

export async function setBookingWindowDays(days: number) {
  return prisma.settings.upsert({
    where: { id: SINGLETON },
    update: { bookingWindowDays: days },
    create: { id: SINGLETON, bookingWindowDays: days },
  });
}
