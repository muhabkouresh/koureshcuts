import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateHoursSchema } from "@/lib/validation";

// PUT /api/admin/hours — replace the weekly business-hours template.
export async function PUT(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = updateHoursSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid hours." }, { status: 400 });
  }

  for (const h of parsed.data.hours) {
    if (!h.isClosed && h.closeMinute <= h.openMinute) {
      return Response.json(
        { error: "Closing time must be after opening time." },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(
    parsed.data.hours.map((h) =>
      prisma.businessHours.upsert({
        where: { dayOfWeek: h.dayOfWeek },
        update: {
          isClosed: h.isClosed,
          openMinute: h.openMinute,
          closeMinute: h.closeMinute,
        },
        create: {
          dayOfWeek: h.dayOfWeek,
          isClosed: h.isClosed,
          openMinute: h.openMinute,
          closeMinute: h.closeMinute,
        },
      }),
    ),
  );

  return Response.json({ ok: true });
}
