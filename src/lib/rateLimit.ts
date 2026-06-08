// Lightweight in-memory rate limiter (fixed window per key).
//
// Good enough for a single-chair shop on a single serverless instance: it caps
// abusive booking bursts from one IP. It is NOT a distributed limiter — across
// many cold serverless instances each has its own window. For stronger limits
// later, back this with Upstash/Redis. The DB transaction still prevents real
// double-bookings regardless.

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Allow up to `limit` hits per `windowMs` for a given `key`.
 * Returns ok=false once the limit is exceeded within the window.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Best-effort client IP from common proxy headers (Vercel sets these). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
