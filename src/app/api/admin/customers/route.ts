import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/customers — distinct past customers (for assigning a new
// appointment to an existing customer). Deduplicated by email, then name.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rows = await prisma.appointment.findMany({
    orderBy: { createdAt: "desc" },
    select: { customerName: true, customerEmail: true, customerPhone: true },
    take: 1000,
  });

  const seen = new Set<string>();
  const customers: {
    name: string;
    email: string;
    phone: string;
  }[] = [];
  for (const r of rows) {
    const key = (r.customerEmail || r.customerName).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    customers.push({
      name: r.customerName,
      email: r.customerEmail,
      phone: r.customerPhone,
    });
  }

  customers.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return Response.json({ customers });
}
