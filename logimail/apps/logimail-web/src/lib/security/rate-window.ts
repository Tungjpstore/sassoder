// Pure fixed-window rate-limit math (Requirement 16). No imports so the window
// behaviour can be unit-tested without HTTP/Request plumbing.

export type RateBucket = { count: number; resetAt: number };

export type RateDecision = {
  allowed: boolean;
  bucket: RateBucket;
  retryAfterSeconds: number;
};

/**
 * Evaluate a fixed-window limiter for one bucket.
 *  - A new or expired window starts fresh at count 1.
 *  - Otherwise the count increments; exceeding `limit` rejects with retry-after.
 */
export function evaluateFixedWindow(
  current: RateBucket | undefined,
  now: number,
  limit: number,
  windowMs: number,
): RateDecision {
  if (!current || current.resetAt <= now) {
    return { allowed: true, bucket: { count: 1, resetAt: now + windowMs }, retryAfterSeconds: 0 };
  }

  const next: RateBucket = { count: current.count + 1, resetAt: current.resetAt };
  if (next.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return { allowed: false, bucket: next, retryAfterSeconds };
  }
  return { allowed: true, bucket: next, retryAfterSeconds: 0 };
}

// Named presets for sensitive endpoints (R16.1).
export const RATE_LIMIT_PRESETS = {
  mailboxUnlock: { limit: 8, windowMs: 60_000 },
  adminAction: { limit: 30, windowMs: 60_000 },
} as const;
