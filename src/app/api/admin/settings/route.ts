import { isAuthenticated } from "@/lib/auth";
import { setBookingWindowDays } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";

// PUT /api/admin/settings — update the public booking window (in weeks).
export async function PUT(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Bitte 1–365 Tage angeben." },
      { status: 400 },
    );
  }

  await setBookingWindowDays(parsed.data.bookingWindowDays);
  return Response.json({ ok: true });
}
