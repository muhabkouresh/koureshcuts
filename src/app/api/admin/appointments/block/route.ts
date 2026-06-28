import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BUSY_STATUSES, AppointmentStatus, SLOT_INTERVAL_MINUTES } from "@/lib/constants";

// POST /api/admin/appointments/block — block a single time slot so it can't be
// booked (break, errand, private). Stored as an appointment with status BLOCKED:
// it occupies the slot (BUSY_STATUSES) but never counts as revenue and never
// appears in the customer flow. A serviceId is required by the schema, so we
// attach a placeholder service; it is never shown (blocks render as "Gesperrt").
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const { start, durationMinutes, reason } = (body ?? {}) as {
    start?: string;
    durationMinutes?: number;
    reason?: string;
  };

  const startDate = start ? new Date(start) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return Response.json({ error: "Ungültige Startzeit." }, { status: 400 });
  }
  const duration =
    typeof durationMinutes === "number" && durationMinutes > 0
      ? Math.min(durationMinutes, 24 * 60)
      : SLOT_INTERVAL_MINUTES;
  const end = new Date(startDate.getTime() + duration * 60_000);

  // The schema needs a service FK; any service works since blocks are rendered
  // by status, not by service.
  const placeholder = await prisma.service.findFirst({
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!placeholder) {
    return Response.json({ error: "Kein Service vorhanden." }, { status: 400 });
  }

  let id: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const clash = await tx.appointment.findFirst({
        where: {
          status: { in: BUSY_STATUSES },
          startTime: { lt: end },
          endTime: { gt: startDate },
        },
        select: { id: true },
      });
      if (clash) throw new Error("SLOT_TAKEN");
      return tx.appointment.create({
        data: {
          serviceId: placeholder.id,
          customerName: "— Gesperrt —",
          customerEmail: "",
          customerPhone: "",
          notes: (reason ?? "").slice(0, 200),
          startTime: startDate,
          endTime: end,
          status: AppointmentStatus.BLOCKED,
        },
        select: { id: true },
      });
    });
    id = created.id;
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return Response.json(
        { error: "Diese Zeit ist bereits belegt." },
        { status: 409 },
      );
    }
    console.error("block create error", err);
    return Response.json(
      { error: "Slot konnte nicht gesperrt werden." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, id }, { status: 201 });
}
