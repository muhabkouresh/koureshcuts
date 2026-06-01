import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

// Lightweight single-admin session using a signed, HTTP-only cookie.

export type AdminSession = {
  isAdmin?: boolean;
};

const password = process.env.SESSION_SECRET || "";

export const sessionOptions: SessionOptions = {
  password,
  cookieName: "kc_admin",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};

export async function getAdminSession() {
  const cookieStore = await cookies();
  return getIronSession<AdminSession>(cookieStore, sessionOptions);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!password) return false;
  const session = await getAdminSession();
  return session.isAdmin === true;
}

/** Verify a submitted admin password against ADMIN_PASSWORD. */
export function checkPassword(submitted: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;
  // Constant-ish comparison; admin auth is low-volume.
  if (submitted.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= submitted.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
