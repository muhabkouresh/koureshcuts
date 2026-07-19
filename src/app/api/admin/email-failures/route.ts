import { isAuthenticated } from "@/lib/auth";
import { retryFailedEmails } from "@/lib/email";

// Retrying many mails sequentially can exceed the default limit.
export const maxDuration = 60;

// POST /api/admin/email-failures — "Jetzt erneut versuchen" on the dashboard
// warning banner: resend every queued mail Resend previously refused (the
// daily 07:00 cron does the same automatically with fresh quota).
export async function POST() {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await retryFailedEmails();
  return Response.json({ ok: true, ...result });
}
