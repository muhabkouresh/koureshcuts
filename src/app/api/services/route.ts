import { prisma } from "@/lib/prisma";

// GET /api/services — list active services for the booking UI.
export async function GET() {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      durationMinutes: true,
      priceCents: true,
    },
  });
  return Response.json({ services });
}
