import { prisma } from "./prisma";

// Editable shop settings (single row).

const SINGLETON = "singleton";
const DEFAULT_WINDOW_DAYS = 28;

export type SettingsPatch = {
  bookingWindowDays?: number;
  reminderEnabled?: boolean;
  reminderLeadHours?: number;
  cancelDeadlineHours?: number;
  maxActiveBookingsPerEmail?: number;
};

export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: SINGLETON } });
  if (existing) return existing;
  return prisma.settings.create({
    data: { id: SINGLETON, bookingWindowDays: DEFAULT_WINDOW_DAYS },
  });
}

/** Update any subset of settings (only provided fields are changed). */
export async function updateSettings(patch: SettingsPatch) {
  return prisma.settings.upsert({
    where: { id: SINGLETON },
    update: patch,
    create: { id: SINGLETON, bookingWindowDays: DEFAULT_WINDOW_DAYS, ...patch },
  });
}
