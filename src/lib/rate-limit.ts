/**
 * Best-effort in-process rate limiting.
 *
 * On a serverless platform each instance keeps its own counters, so this is a speed bump
 * rather than a guarantee — it is aimed at a single phone hammering an endpoint, not at a
 * distributed attacker. The durable limits that actually bound cost live in the database
 * (players per game, images per game).
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5_000;

function sweep(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Clears all counters. Test-only. */
export function resetRateLimits() {
  buckets.clear();
}
