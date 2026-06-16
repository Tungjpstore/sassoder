// Pure SLA + alerting thresholds (Requirement 11). No imports so the SLA math
// and bounce-rate threshold can be unit-tested directly.

export type RequestType = 'account' | 'domain' | 'mailbox';

const HOUR_MS = 60 * 60 * 1000;

// Default SLA targets (R11.4).
export const SLA_TARGET_MS: Record<RequestType, number> = {
  account: 4 * HOUR_MS,
  domain: 8 * HOUR_MS,
  mailbox: 2 * HOUR_MS,
};

// Hard-bounce alert threshold over 24h (R11.2).
export const BOUNCE_RATE_THRESHOLD = 0.05;

export function slaTargetMs(type: RequestType): number {
  return SLA_TARGET_MS[type];
}

/** Elapsed time between request creation and resolution (R11.3). */
export function elapsedMs(createdAt: string | number | Date, resolvedAt: string | number | Date): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(resolvedAt).getTime();
  return Math.max(0, end - start);
}

/** True when a still-pending request has exceeded its SLA target (R11.4). */
export function isPendingOverdue(createdAt: string | number | Date, type: RequestType, now: number = Date.now()): boolean {
  return now - new Date(createdAt).getTime() > slaTargetMs(type);
}

/** Bounce rate = hard+complaint bounces / messages sent (0..1). */
export function bounceRate(hardBounces: number, sent: number): number {
  if (sent <= 0) return 0;
  return hardBounces / sent;
}

/** True when the bounce rate exceeds the configured threshold (R11.2). */
export function isBounceRateBreached(hardBounces: number, sent: number, threshold = BOUNCE_RATE_THRESHOLD): boolean {
  return bounceRate(hardBounces, sent) > threshold;
}
