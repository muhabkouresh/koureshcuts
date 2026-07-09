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

/** Full public reschedule URL for an appointment (same token as cancel). */
export function rescheduleUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/termin/verschieben/${id}?t=${cancelToken(id)}`;
}

// Slot-offer token (waitlist fast lane). Domain-separated from the other
// token types via the "offer:" prefix.
export function offerToken(id: string): string {
  if (!secret) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(`offer:${id}`)
    .digest("base64url");
}

export function verifyOfferToken(
  id: string,
  token: string | undefined,
): boolean {
  if (!secret || !token) return false;
  const expected = offerToken(id);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Full public URL of a slot offer (accept/decline page). */
export function offerUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/warteliste/angebot/${id}?t=${offerToken(id)}`;
}

// "Meine Termine" magic link: HMAC over the lowercased email. The "email:"
// prefix domain-separates these tokens from the appointment-id cancel tokens.
export function emailToken(email: string): string {
  if (!secret) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(`email:${email.trim().toLowerCase()}`)
    .digest("base64url");
}

export function verifyEmailToken(
  email: string,
  token: string | undefined,
): boolean {
  if (!secret || !token) return false;
  const expected = emailToken(email);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Full "Meine Termine" URL for a customer email. */
export function myAppointmentsUrl(email: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const e = Buffer.from(email.trim().toLowerCase()).toString("base64url");
  return `${base}/meine-termine/liste?e=${e}&t=${emailToken(email)}`;
}
