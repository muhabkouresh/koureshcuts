import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { productSaleSchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/time";

// Manually logged product sales (wax, shampoo, …) for the admin Umsatz tab.

// GET /api/admin/product-sales — the last 100 entries, newest first.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const sales = await prisma.productSale.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return Response.json({
    sales: sales.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      amountCents: s.amountCents,
      note: s.note,
    })),
  });
}

// POST /api/admin/product-sales — log a sale.
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
  const parsed = productSaleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }
  const { date, amountCents, note } = parsed.data;
  const created = await prisma.productSale.create({
    data: {
      date: zonedToUtc(date, 0, siteConfig.timezone),
      amountCents,
      note: note ?? "",
    },
  });
  return Response.json({ ok: true, id: created.id }, { status: 201 });
}

// DELETE /api/admin/product-sales?id=... — remove a mistyped entry.
export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "ID fehlt." }, { status: 400 });
  }
  await prisma.productSale.delete({ where: { id } }).catch(() => {});
  return Response.json({ ok: true });
}
