import crypto from "node:crypto";

// Signed cancellation token so a customer can cancel their own booking from a
// link in the email — without accounts. token = HMAC-SHA256(id, SESSION_SECRET).

const secret = process.env.SESSION_SECRET || "";

export function cancelToken(id: string): string {
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(id).digest("base64url");
}

export function verifyCancelToken(id: string, token: string | undefined): boolean {
  if (!secret || !token) return false;
  const expected = cancelToken(id);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Full public cancellation URL for an appointment. */
export function cancelUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/termin/absagen/${id}?t=${cancelToken(id)}`;
}
