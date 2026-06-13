import 'server-only';

import { jsonError } from '@/lib/api-boundary';

type Bucket = { count: number; resetAt: number };

// In-memory fixed-window limiter. Adequate for a single-instance Next deploy as a
// first line of defense against brute force / abuse. For multi-instance scale,
// back this with Redis later.
const buckets = new Map<string, Bucket>();

function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

/**
 * Returns a 429 response when the caller exceeds `limit` requests within
 * `windowMs`, otherwise null. Sweeps expired buckets opportunistically.
 */
export function enforceRateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = clientKey(request, scope);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      const response = jsonError('rate_limited', 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.', 429);
      response.headers.set('Retry-After', String(retryAfter));
      return response;
    }
  }

  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return null;
}
