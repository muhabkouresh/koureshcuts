import { prisma } from "./prisma";
import { siteConfig } from "@/config/site";
import { BUSY_STATUSES, SLOT_INTERVAL_MINUTES } from "./constants";
import { sendSlotOfferEmail } from "./email";
import { sendAdminPush } from "./push";
import { dateKey, formatDateTimeLabel, weekdayOf, zonedToUtc } from "./time";

// Waitlist 2.0 queue engine. A freed slot is offered EXCLUSIVELY to the first
// matching entry (priority desc, then first come, first served) for
// OFFER_HOLD_MINUTES; on expiry or decline it cascades to the next person.
// While an offer is PENDING and unexpired the slot is blocked from public
// booking (availability treats it as busy). Expiry needs no timer: expired
// offers never block (queries filter on expiresAt) and `expireStaleOffers`
// runs opportunistically on traffic + the daily cron to cascade.

export const OFFER_HOLD_MINUTES = 60;

const tz = siteConfig.timezone;

/** Is [start,end) free of active bookings and unexpired pending offers? */
async function slotIsFree(start: Date, end: Date): Promise<boolean> {
  const clash = await prisma.appointment.findFirst({
    where: {
      status: { in: BUSY_STATUSES },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { id: true },
  });
  if (clash) return false;
  const offerClash = await prisma.slotOffer.findFirst({
    where: {
      status: "PENDING",
      expiresAt: { gt: new Date() },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { id: true },
  });
  return !offerClash;
}

/** Does this entry want a slot on this calendar day? */
function entryMatchesDay(
  entry: { date: Date | null; weekdays: string },
  slotStart: Date,
): boolean {
  const ds = dateKey(slotStart, tz);
  if (entry.date) return dateKey(entry.date, tz) === ds;
  if (!entry.weekdays) return true;
  return entry.weekdays.split(",").includes(String(weekdayOf(ds)));
}

/**
 * Offer the slot starting at `start` to the next matching queue entry.
 * Returns true if an offer was created. Entries that already hold a pending
 * offer are skipped (one offer per person at a time).
 */
export async function offerSlotToNext(start: Date): Promise<boolean> {
  if (start <= new Date()) return false;

  // If even the base slot window is taken, nobody can be offered anything.
  const baseEnd = new Date(start.getTime() + SLOT_INTERVAL_MINUTES * 60_000);
  if (!(await slotIsFree(start, baseEnd))) return false;

  const entries = await prisma.waitlistEntry.findMany({
    where: {
      OR: [{ date: null }, { date: { gte: zonedToUtc(dateKey(start, tz), 0, tz) } }],
    },
    include: {
      service: { select: { name: true, durationMinutes: true, active: true } },
      offers: {
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
        select: { id: true },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 200,
  });

  for (const entry of entries) {
    if (entry.offers.length > 0) continue;
    if (!entry.service.active) continue;
    if (!entryMatchesDay(entry, start)) continue;

    // Longer services must also fit past the base window; if not, a shorter
    // entry further down the queue may still take the slot.
    const end = new Date(start.getTime() + entry.service.durationMinutes * 60_000);
    if (end > baseEnd && !(await slotIsFree(baseEnd, end))) continue;

    const expiresAt = new Date(Date.now() + OFFER_HOLD_MINUTES * 60_000);
    const offer = await prisma.slotOffer.create({
      data: {
        entryId: entry.id,
        serviceId: entry.serviceId,
        startTime: start,
        endTime: end,
        expiresAt,
        status: "PENDING",
      },
    });

    let delivered = false;
    try {
      const res = await sendSlotOfferEmail({
        offerId: offer.id,
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        serviceName: entry.service.name,
        start,
        expiresAt,
      });
      delivered = res.ok;
    } catch (err) {
      console.error("slot offer email failed", err);
    }
    if (!delivered) {
      // Undeliverable — release the hold and try the next person.
      await prisma.slotOffer.update({
        where: { id: offer.id },
        data: { status: "EXPIRED" },
      });
      continue;
    }

    try {
      await sendAdminPush(
        "Slot der Warteliste angeboten",
        `${entry.customerName} — ${entry.service.name}, ${formatDateTimeLabel(start, tz)} (reserviert für ${OFFER_HOLD_MINUTES} Min.)`,
      );
    } catch (err) {
      console.error("offer push failed", err);
    }
    return true;
  }
  return false;
}

/**
 * Mark expired pending offers and cascade each freed slot to the next person.
 * Cheap when nothing is stale — safe to call from any traffic path.
 */
export async function expireStaleOffers(): Promise<void> {
  const stale = await prisma.slotOffer.findMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    select: { id: true, startTime: true },
    take: 20,
  });
  for (const offer of stale) {
    await prisma.slotOffer.update({
      where: { id: offer.id },
      data: { status: "EXPIRED" },
    });
    try {
      await offerSlotToNext(offer.startTime);
    } catch (err) {
      console.error("offer cascade failed", err);
    }
  }
}

/** A booked slot was freed (cancellation/reschedule) — feed the queue. */
export async function processFreedSlot(start: Date): Promise<void> {
  try {
    await expireStaleOffers();
    await offerSlotToNext(start);
  } catch (err) {
    console.error("queue processing failed", err);
  }
}

/**
 * An entry is being removed from the queue: release its live slot holds and
 * pass those slots on to the next person. Call BEFORE deleting the entry.
 */
export async function releaseEntryOffers(entryId: string): Promise<void> {
  const pending = await prisma.slotOffer.findMany({
    where: { entryId, status: "PENDING" },
    select: { id: true, startTime: true, expiresAt: true },
  });
  for (const offer of pending) {
    await prisma.slotOffer.update({
      where: { id: offer.id },
      data: { status: "EXPIRED" },
    });
    if (offer.expiresAt > new Date()) {
      try {
        await offerSlotToNext(offer.startTime);
      } catch (err) {
        console.error("release cascade failed", err);
      }
    }
  }
}

/**
 * A new special working day was created with a waitlist head start: offer its
 * slots to the queue, one exclusive offer per free slot, before `publicFrom`
 * makes the remainder publicly bookable.
 */
export async function offerDayToQueue(
  dateStr: string,
  openMinute: number,
  closeMinute: number,
  slotIntervalMinutes: number,
): Promise<number> {
  await expireStaleOffers();
  let created = 0;
  for (
    let minute = openMinute;
    minute + slotIntervalMinutes <= closeMinute;
    minute += slotIntervalMinutes
  ) {
    const start = zonedToUtc(dateStr, minute, tz);
    try {
      if (await offerSlotToNext(start)) created += 1;
    } catch (err) {
      console.error("day offer failed", err);
    }
  }
  return created;
}
