import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/customers — distinct customers with stats (appointments had,
// money spent on completed visits, last visit). Deduplicated by email, then name.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rows = await prisma.appointment.findMany({
    orderBy: { startTime: "desc" },
    select: {
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      status: true,
      startTime: true,
      service: { select: { priceCents: true } },
    },
    take: 3000,
  });

  type Customer = {
    name: string;
    email: string;
    phone: string;
    appointments: number; // non-cancelled count
    completed: number;
    spentCents: number;
    lastStart: string | null;
  };

  const map = new Map<string, Customer>();
  for (const r of rows) {
    const key = (r.customerEmail || r.customerName).toLowerCase().trim();
    if (!key) continue;
    let c = map.get(key);
    if (!c) {
      // rows are newest-first, so the first seen carries the latest contact info.
      c = {
        name: r.customerName,
        email: r.customerEmail,
        phone: r.customerPhone,
        appointments: 0,
        completed: 0,
        spentCents: 0,
        lastStart: null,
      };
      map.set(key, c);
    }
    if (!c.phone && r.customerPhone) c.phone = r.customerPhone;
    if (r.status !== "CANCELLED") {
      c.appointments += 1;
      if (!c.lastStart) c.lastStart = r.startTime.toISOString();
    }
    if (r.status === "COMPLETED") {
      c.completed += 1;
      c.spentCents += r.service.priceCents;
    }
  }

  const customers = [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "de"),
  );
  return Response.json({ customers });
}
