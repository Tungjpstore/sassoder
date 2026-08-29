import 'server-only';

import { jsonError } from '@/lib/api-boundary';
import { trustedClientIp } from '@/lib/client-ip';
import { evaluateFixedWindow, RATE_LIMIT_PRESETS, type RateBucket } from '@/lib/security/rate-window';

// In-memory fixed-window limiter. Adequate for a single-instance Next deploy as a
// first line of defense against brute force / abuse. For multi-instance scale,
// back this with Redis later. The window math lives in `security/rate-window`
// (a pure module) so it can be unit-tested without HTTP plumbing.
const buckets = new Map<string, RateBucket>();

function clientKey(request: Request, scope: string) {
  return `${scope}:${trustedClientIp(request.headers)}`;
}

function identityKey(scope: string, identity: string) {
  return `${scope}:${identity}`;
}

function enforceRateLimitForKey(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const decision = evaluateFixedWindow(buckets.get(key), now, limit, windowMs);
  buckets.set(key, decision.bucket);

  if (!decision.allowed) {
    const response = jsonError('rate_limited', 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.', 429);
    response.headers.set('Retry-After', String(decision.retryAfterSeconds));
    return response;
  }

  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return null;
}

/**
 * Returns a 429 response when the caller exceeds `limit` requests within
 * `windowMs`, otherwise null. Sweeps expired buckets opportunistically.
 */
export function enforceRateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  return enforceRateLimitForKey(clientKey(request, scope), limit, windowMs);
}

/**
 * Rate-limit a stable account/resource identity independently of the caller IP.
 * Pair this with an IP bucket when an endpoint needs both protections.
 */
export function enforceIdentityRateLimit(scope: string, identity: string, limit: number, windowMs: number) {
  return enforceRateLimitForKey(identityKey(scope, identity), limit, windowMs);
}

/** Sensitive endpoint preset: mailbox unlock — 8/minute/IP (R16.1). */
export function enforceMailboxUnlockRateLimit(request: Request) {
  return enforceRateLimit(request, 'mailbox-unlock', RATE_LIMIT_PRESETS.mailboxUnlock.limit, RATE_LIMIT_PRESETS.mailboxUnlock.windowMs);
}

/** Sensitive endpoint preset: admin actions — 30/minute/IP (R16.1). */
export function enforceAdminActionRateLimit(request: Request, scope = 'admin-action') {
  return enforceRateLimit(request, scope, RATE_LIMIT_PRESETS.adminAction.limit, RATE_LIMIT_PRESETS.adminAction.windowMs);
}
