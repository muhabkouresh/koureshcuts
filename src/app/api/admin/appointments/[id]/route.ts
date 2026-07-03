import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appointmentActionSchema } from "@/lib/validation";
import { notifyWaitlistForDay } from "@/lib/waitlist";
import { sendShopCancellationEmail } from "@/lib/email";

// PATCH /api/admin/appointments/[id] — update an appointment's status
// (e.g. CANCELLED, COMPLETED, CONFIRMED). When cancelling with notify=true,
// the customer is emailed that the shop cancelled (optional reason).
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/admin/appointments/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = appointmentActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültiger Status." }, { status: 400 });
  }

  const existing = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true },
  });
  if (!existing) {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const cancelling =
    parsed.data.status === "CANCELLED" && existing.status !== "CANCELLED";

  await prisma.appointment.update({
    where: { id },
    data: {
      status: parsed.data.status,
      ...(cancelling && parsed.data.reason
        ? {
            notes:
              (existing.notes ? `${existing.notes}\n` : "") +
              `Vom Shop abgesagt: ${parsed.data.reason}`,
          }
        : {}),
    },
  });

  let notified = false;
  if (cancelling) {
    // Tell the customer the shop cancelled (only when asked to and possible).
    if (parsed.data.notify && existing.customerEmail) {
      try {
        await sendShopCancellationEmail(
          {
            id: existing.id,
            customerName: existing.customerName,
            customerEmail: existing.customerEmail,
            serviceName: existing.service.name,
            priceCents: existing.service.priceCents,
            start: existing.startTime,
            end: existing.endTime,
          },
          parsed.data.reason,
        );
        notified = true;
      } catch (err) {
        console.error("shop cancellation email failed", err);
      }
    }

    // A spot opened up — auto-notify anyone on the waitlist for that day.
    try {
      await notifyWaitlistForDay(existing.startTime);
    } catch (err) {
      console.error("waitlist auto-notify failed", err);
    }
  }

  return Response.json({ ok: true, notified });
}

// DELETE /api/admin/appointments/[id] — free a manual block. Restricted to
// BLOCKED rows; real bookings are cancelled (PATCH), never hard-deleted.
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/appointments/[id]">,
) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (existing.status !== "BLOCKED") {
    return Response.json(
      { error: "Nur Sperrungen können gelöscht werden." },
      { status: 400 },
    );
  }

  await prisma.appointment.delete({ where: { id } });

  // Freeing the slot may open a previously-full day — notify the waitlist.
  try {
    await notifyWaitlistForDay(existing.startTime);
  } catch (err) {
    console.error("waitlist auto-notify failed", err);
  }

  return Response.json({ ok: true });
}
