import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES, AppointmentStatus } from "@/lib/constants";
import { adminCreateAppointmentSchema } from "@/lib/validation";
import { sendConfirmationEmails } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/admin/appointments — admin schedules an appointment manually.
// Allows times outside normal hours (still prevents overlaps with a transaction).
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

  const parsed = adminCreateAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
    return Response.json({ error: message }, { status: 400 });
  }
  const input = parsed.data;

  if (input.customerEmail && !EMAIL_RE.test(input.customerEmail)) {
    return Response.json({ error: "Ungültige E-Mail." }, { status: 400 });
  }
  if (input.notify && !input.customerEmail) {
    return Response.json(
      { error: "Für die Benachrichtigung wird eine E-Mail benötigt." },
      { status: 400 },
    );
  }

  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
  });
  if (!service) {
    return Response.json({ error: "Service nicht gefunden." }, { status: 400 });
  }

  const start = new Date(input.start);
  const end = new Date(start.getTime() + service.durationMinutes * 60_000);

  let appointmentId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const clash = await tx.appointment.findFirst({
        where: {
          status: { in: ACTIVE_STATUSES },
          startTime: { lt: end },
          endTime: { gt: start },
        },
        select: { id: true },
      });
      if (clash) throw new Error("SLOT_TAKEN");
      return tx.appointment.create({
        data: {
          serviceId: service.id,
          customerName: input.customerName,
          customerEmail: input.customerEmail ?? "",
          customerPhone: input.customerPhone ?? "",
          notes: input.notes ?? "",
          startTime: start,
          endTime: end,
          status: AppointmentStatus.CONFIRMED,
        },
        select: { id: true },
      });
    });
    appointmentId = created.id;
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      return Response.json(
        { error: "Zu dieser Zeit existiert bereits ein Termin." },
        { status: 409 },
      );
    }
    console.error("admin booking error", err);
    return Response.json(
      { error: "Termin konnte nicht angelegt werden." },
      { status: 500 },
    );
  }

  if (input.notify && input.customerEmail) {
    try {
      await sendConfirmationEmails({
        id: appointmentId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        serviceName: service.name,
        priceCents: service.priceCents,
        start,
        end,
      });
    } catch (err) {
      console.error("admin confirmation email failed", err);
    }
  }

  return Response.json({ ok: true, id: appointmentId }, { status: 201 });
}
