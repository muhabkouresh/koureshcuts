import crypto from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { dateKey } from "@/lib/time";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// POST /api/track — privacy-light page-view beacon for the admin Statistik
// tab. No cookies; uniques come from a salted hash of ip+ua that rotates
// daily, so visitors can't be tracked across days. Admin/API paths and known
// bots are ignored.

const bodySchema = z.object({
  path: z.string().min(1).max(300),
  referrer: z.string().max(500).optional(),
});

const BOT_RE =
  /bot|crawl|spider|slurp|preview|monitor|pingdom|lighthouse|headless|uptime/i;

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = rateLimit(`track:${ip}`, 60, 10 * 60_000);
  if (!limit.ok) return new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 204 });

  const ua = request.headers.get("user-agent") ?? "";
  const path = parsed.data.path.split("?")[0];
  if (BOT_RE.test(ua) || path.startsWith("/admin") || path.startsWith("/api")) {
    return new Response(null, { status: 204 });
  }

  const day = dateKey(new Date(), siteConfig.timezone);
  const secret = process.env.SESSION_SECRET || "";
  const visitor = crypto
    .createHash("sha256")
    .update(`${ip}|${ua}|${day}|${secret}`)
    .digest("hex")
    .slice(0, 16);
  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobil" : "desktop";

  // Keep only the referrer host, and drop self-referrals.
  let referrer = "";
  try {
    const raw = parsed.data.referrer?.trim();
    if (raw) {
      const host = new URL(raw).hostname.replace(/^www\./, "");
      if (host && !host.includes("koureshcuts")) referrer = host;
    }
  } catch {
    /* unparseable referrer — ignore */
  }

  try {
    await prisma.pageView.create({
      data: { day, path, referrer, device, visitor },
    });
  } catch (err) {
    console.error("track failed", err);
  }
  return new Response(null, { status: 204 });
}
