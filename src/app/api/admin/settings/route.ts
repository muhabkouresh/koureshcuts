import { isAuthenticated } from "@/lib/auth";
import { updateSettings } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";

// PUT /api/admin/settings — update shop settings (booking window, reminders).
// Only the provided fields are changed.
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
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }

  await updateSettings(parsed.data);
  return Response.json({ ok: true });
}
