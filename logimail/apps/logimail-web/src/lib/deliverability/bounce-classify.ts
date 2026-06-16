// Pure bounce classification + suppression logic (Requirement 5 / Property 7).
// No imports so classification and suppression enforcement can be tested directly.

export type BounceType = 'hard' | 'soft' | 'complaint' | 'blocked' | 'unknown';

export type BounceSignal = {
  /** Explicit event type from the source, if any (e.g. 'complaint'). */
  eventType?: string | null;
  smtpCode?: string | number | null;
  reason?: string | null;
};

function text(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

/**
 * Classify a bounce/complaint notification (R5.1). Precedence:
 *  1. complaint (feedback loop / abuse)
 *  2. blocked (blocklist / spam rejection)
 *  3. SMTP 5xx -> hard, 4xx -> soft
 *  4. otherwise unknown
 */
export function classifyBounce(signal: BounceSignal): BounceType {
  const type = text(signal.eventType);
  const reason = text(signal.reason);
  const code = String(signal.smtpCode ?? '').trim();

  if (type === 'complaint' || reason.includes('complaint') || reason.includes('abuse') || reason.includes('feedback loop')) {
    return 'complaint';
  }
  if (type === 'blocked' || reason.includes('blocklist') || reason.includes('blacklist') || reason.includes('spam') || reason.includes('blocked')) {
    return 'blocked';
  }
  if (type === 'hard') return 'hard';
  if (type === 'soft') return 'soft';

  if (/^5\d\d/.test(code)) return 'hard';
  if (/^4\d\d/.test(code)) return 'soft';

  return 'unknown';
}

/** Hard bounces and complaints suppress the recipient (R5.3). */
export function shouldSuppress(bounceType: BounceType): boolean {
  return bounceType === 'hard' || bounceType === 'complaint';
}

/** Suppression reason persisted for a suppressed recipient. */
export function suppressionReasonFor(bounceType: BounceType): 'hard_bounce' | 'complaint' | null {
  if (bounceType === 'hard') return 'hard_bounce';
  if (bounceType === 'complaint') return 'complaint';
  return null;
}

/** Whether an email is present in a suppression set (case-insensitive) (R5.4). */
export function isSuppressed(list: Iterable<string>, email: string): boolean {
  const needle = email.toLowerCase();
  for (const entry of list) {
    if (entry.toLowerCase() === needle) return true;
  }
  return false;
}
