// Pure anti-abuse threshold logic (Requirement 16.3). No imports so it can be
// unit-tested directly; the DB-backed enforcement lives in `lib/anti-abuse.ts`.

/** Default send-rate ceiling: 300 messages per hour per mailbox. */
export const DEFAULT_SEND_RATE_LIMIT_PER_HOUR = 300;

export const SEND_RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * A mailbox is over its send-rate budget when the count of messages sent within
 * the trailing window reaches or exceeds the threshold. At exactly `threshold`
 * the budget is consumed, so the next send must be paused.
 */
export function isSendRateExceeded(countInWindow: number, threshold = DEFAULT_SEND_RATE_LIMIT_PER_HOUR): boolean {
  return countInWindow >= threshold;
}

/** ISO timestamp marking the start of the trailing send-rate window. */
export function sendRateWindowStart(now = Date.now(), windowMs = SEND_RATE_WINDOW_MS): string {
  return new Date(now - windowMs).toISOString();
}
