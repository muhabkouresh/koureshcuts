import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAdminPush } from "@/lib/push";

// Visibility into customer push adoption. Without it, a broken opt-in looks
// exactly like "no customer wants notifications" — which is how an activation
// bug once went unnoticed for weeks.

// GET /api/admin/push/stats — how many customer devices can receive pushes.
export async function GET() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [total, withEmail, radar, last7Days, newest] = await Promise.all([
    prisma.customerPush.count(),
    // Devices tied to an email address get appointment reminders.
    prisma.customerPush.count({ where: { email: { not: "" } } }),
    // Devices still eligible for "slot freed" alerts (radar, not reminder-only).
    prisma.customerPush.count({ where: { notifiedAt: null } }),
    prisma.customerPush.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.customerPush.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return Response.json({
    total,
    withEmail,
    radar,
    last7Days,
    lastRegisteredAt: newest?.createdAt.toISOString() ?? null,
  });
}

// POST /api/admin/push/stats — send a test notification to the owner's own
// devices, so delivery can be proven end to end instead of assumed.
export async function POST() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const devices = await prisma.pushSubscription.count();
  if (devices === 0) {
    return Response.json({ ok: true, sent: 0 });
  }
  await sendAdminPush(
    "Test ✅",
    "Wenn du das siehst, funktionieren deine Benachrichtigungen.",
  );
  return Response.json({ ok: true, sent: devices });
}
