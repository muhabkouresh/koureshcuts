// End-to-end correctness checks against the dev DB. Creates temp rows, verifies
// behaviour, then cleans up. Safe to run repeatedly.
import { prisma } from "../src/lib/prisma";
import { getMonthAvailability, getAvailability } from "../src/lib/availability";
import { getRevenueStats } from "../src/lib/revenue";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

async function main() {
  const svc = await prisma.service.findFirst({ where: { active: true } });
  if (!svc) throw new Error("no active service");

  // Pick a future open day in June 2026.
  const before = await getMonthAvailability(svc.id, 2026, 5);
  const day = before.days.find((d) => d >= 5);
  if (!day) throw new Error("no open day to test");
  const ds = `2026-06-${String(day).padStart(2, "0")}`;

  // --- 1) Time-off add/remove ---
  const to = await prisma.timeOff.create({
    data: {
      startDate: new Date(`${ds}T00:00:00+02:00`),
      endDate: new Date(`2026-06-${String(day + 1).padStart(2, "0")}T00:00:00+02:00`),
      reason: "selftest",
    },
  });
  const blocked = await getMonthAvailability(svc.id, 2026, 5);
  check(`time-off blocks day ${day}`, !blocked.days.includes(day));
  const dayAvail = await getAvailability(svc.id, ds);
  check(`time-off -> 0 slots on ${ds}`, dayAvail.slots.length === 0);

  await prisma.timeOff.delete({ where: { id: to.id } });
  const freed = await getMonthAvailability(svc.id, 2026, 5);
  check(`removing time-off frees day ${day}`, freed.days.includes(day));

  // --- 2) Double-booking: booking a slot removes it from availability ---
  const slots = (await getAvailability(svc.id, ds)).slots;
  check(`day has slots after freeing`, slots.length > 0);
  const slot = slots[0];
  const appt = await prisma.appointment.create({
    data: {
      serviceId: svc.id,
      customerName: "Selftest",
      customerEmail: "selftest@example.com",
      customerPhone: "",
      startTime: new Date(slot.start),
      endTime: new Date(slot.end),
      status: "CONFIRMED",
    },
  });
  const afterBook = await getAvailability(svc.id, ds);
  check(`booked slot no longer offered`, !afterBook.slots.some((s) => s.start === slot.start));

  // --- 3) Cancelled booking frees the slot again ---
  await prisma.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED" } });
  const afterCancel = await getAvailability(svc.id, ds);
  check(`cancelled slot offered again`, afterCancel.slots.some((s) => s.start === slot.start));

  // --- 4) No-show excluded from revenue, past confirmed counted ---
  const past = new Date(Date.now() - 24 * 3600_000);
  const a1 = await prisma.appointment.create({
    data: { serviceId: svc.id, customerName: "PastDone", customerEmail: "", customerPhone: "",
      startTime: past, endTime: new Date(past.getTime() + 1800_000), status: "CONFIRMED" } });
  const a2 = await prisma.appointment.create({
    data: { serviceId: svc.id, customerName: "PastNoShow", customerEmail: "", customerPhone: "",
      startTime: past, endTime: new Date(past.getTime() + 1800_000), status: "NO_SHOW" } });
  const rev = await getRevenueStats();
  check(`past confirmed counts to revenue`, rev.totalCents >= svc.priceCents);
  check(`no-show counted separately`, rev.noShowCount >= 1 && rev.noShowCents >= svc.priceCents);

  // --- 5) Inactive service hidden from availability ---
  await prisma.service.update({ where: { id: svc.id }, data: { active: false } });
  let hidden = false;
  try { await getAvailability(svc.id, ds); } catch (e) { hidden = (e as Error).message === "INVALID_SERVICE"; }
  check(`inactive service rejected by availability`, hidden);
  await prisma.service.update({ where: { id: svc.id }, data: { active: true } });

  // cleanup
  await prisma.appointment.deleteMany({ where: { id: { in: [appt.id, a1.id, a2.id] } } });

  console.log(`\n${pass} passed, ${fail} failed`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
