import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEmailToken } from "@/lib/token";
import { releaseEntryOffers } from "@/lib/queue";
import { z } from "zod";

const schema = z.object({
  id: z.string().min(1),
  // Base64url email + its magic-link token (same credentials as the
  // "Meine Termine" page) authorize removing own entries only.
  e: z.string().min(1),
  t: z.string().min(1),
});

// POST /api/waitlist/remove — customer removes their own waitlist entry.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  let email = "";
  try {
    email = Buffer.from(parsed.data.e, "base64url").toString("utf8");
  } catch {
    // Malformed — rejected below.
  }
  if (!email || !verifyEmailToken(email, parsed.data.t)) {
    return Response.json({ error: "Ungültiger Link." }, { status: 403 });
  }

  // Only their own entry; free any held slot before removing it.
  const entry = await prisma.waitlistEntry.findFirst({
    where: {
      id: parsed.data.id,
      customerEmail: { equals: email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (entry) {
    await releaseEntryOffers(entry.id);
    await prisma.waitlistEntry.deleteMany({ where: { id: entry.id } });
  }
  return Response.json({ ok: true });
}
