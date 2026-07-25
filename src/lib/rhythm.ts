import { prisma } from "./prisma";

// How far ahead the post-booking "come back again" suggestion should point.
//
// The shop-wide median gap between two visits is ~14 days, so that's the
// fallback for anyone without a personal history. Customers who have been
// here more than once get their OWN median instead — a two-week regular and
// a six-week occasional visitor should not see the same suggestion.

const DEFAULT_GAP_DAYS = 14;
const MIN_GAP_DAYS = 7;
const MAX_GAP_DAYS = 56;

/** Median of a non-empty numeric list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Typical days between visits for this customer, clamped to a sensible range.
 * Returns the shop default when the customer has fewer than two past visits.
 * Never throws — the follow-up offer is optional, so a failure just falls back.
 */
export async function followUpGapDays(email: string): Promise<number> {
  const key = email.trim().toLowerCase();
  if (!key) return DEFAULT_GAP_DAYS;
  try {
    const visits = await prisma.appointment.findMany({
      where: {
        customerEmail: { equals: key, mode: "insensitive" },
        status: { in: ["COMPLETED", "CONFIRMED"] },
        startTime: { lt: new Date() },
      },
      orderBy: { startTime: "asc" },
      select: { startTime: true },
      take: 20,
    });
    if (visits.length < 2) return DEFAULT_GAP_DAYS;

    const gaps: number[] = [];
    for (let i = 1; i < visits.length; i++) {
      const days =
        (visits[i].startTime.getTime() - visits[i - 1].startTime.getTime()) /
        86_400_000;
      // Ignore same-day double bookings (e.g. a friend booked along).
      if (days >= 1) gaps.push(days);
    }
    if (gaps.length === 0) return DEFAULT_GAP_DAYS;

    const rounded = Math.round(median(gaps));
    return Math.min(MAX_GAP_DAYS, Math.max(MIN_GAP_DAYS, rounded));
  } catch (err) {
    console.error("follow-up gap lookup failed", err);
    return DEFAULT_GAP_DAYS;
  }
}
