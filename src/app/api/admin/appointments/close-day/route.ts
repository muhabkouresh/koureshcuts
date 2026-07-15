import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/lib/constants";

const bodySchema = z.object({
  completed: z.array(z.string()).max(200),
  noShows: z.array(z.string()).max(200),
});

// POST /api/admin/appointments/close-day — end-of-day bulk wrap-up: mark the
// day's remaining active appointments as COMPLETED or NO_SHOW in one go.
// Only PENDING/CONFIRMED rows are touched, so stale ids are harmless.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }

  const [completed, noShows] = await Promise.all([
    parsed.data.completed.length
      ? prisma.appointment.updateMany({
          where: {
            id: { in: parsed.data.completed },
            status: { in: ACTIVE_STATUSES },
          },
          data: { status: "COMPLETED" },
        })
      : Promise.resolve({ count: 0 }),
    parsed.data.noShows.length
      ? prisma.appointment.updateMany({
          where: {
            id: { in: parsed.data.noShows },
            status: { in: ACTIVE_STATUSES },
          },
          data: { status: "NO_SHOW" },
        })
      : Promise.resolve({ count: 0 }),
  ]);

  return Response.json({
    ok: true,
    completed: completed.count,
    noShows: noShows.count,
  });
}
