import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { specialDaySchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/time";
import { offerDayToQueue } from "@/lib/queue";
import { SLOT_INTERVAL_MINUTES } from "@/lib/constants";

// GET /api/admin/special-days — upcoming extra working days (public + private).
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Include days from yesterday onward so today's entry stays visible.
  const from = new Date(Date.now() - 24 * 60 * 60_000);
  const days = await prisma.specialDay.findMany({
    where: { date: { gte: from } },
    orderBy: { date: "asc" },
  });
  return Response.json({ specialDays: days });
}

// POST /api/admin/special-days — add an extra working day on a single date.
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

  const parsed = specialDaySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten." },
      { status: 400 },
    );
  }
  const { date, openMinute, closeMinute, isPublic, waitlistLeadHours, note } =
    parsed.data;
  const dayStart = zonedToUtc(date, 0, siteConfig.timezone);
  // Waitlist head start: the day's slots go to the queue first and only
  // become publicly bookable after the lead time.
  const publicFrom =
    isPublic && waitlistLeadHours > 0
      ? new Date(Date.now() + waitlistLeadHours * 3600_000)
      : null;

  try {
    const created = await prisma.specialDay.upsert({
      where: { date: dayStart },
      update: { openMinute, closeMinute, isPublic, publicFrom, note: note ?? "" },
      create: {
        date: dayStart,
        openMinute,
        closeMinute,
        isPublic,
        publicFrom,
        note: note ?? "",
      },
    });

    let offered = 0;
    if (publicFrom) {
      offered = await offerDayToQueue(
        date,
        openMinute,
        closeMinute,
        SLOT_INTERVAL_MINUTES,
      );
    }
    return Response.json({ ok: true, id: created.id, offered }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }
}
