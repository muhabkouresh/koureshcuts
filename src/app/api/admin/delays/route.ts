import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { delayLogSchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/time";

// Delay journal (admin): log and list "running late" entries.

// GET /api/admin/delays — entries of the last 12 months, newest first.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const from = new Date();
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const delays = await prisma.delayLog.findMany({
    where: { date: { gte: from } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return Response.json({ delays });
}

// POST /api/admin/delays — log a delay manually.
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
  const parsed = delayLogSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }
  const { date, minutes, note } = parsed.data;
  const created = await prisma.delayLog.create({
    data: {
      date: zonedToUtc(date, 0, siteConfig.timezone),
      minutes,
      note: note ?? "",
    },
  });
  return Response.json({ ok: true, id: created.id }, { status: 201 });
}
