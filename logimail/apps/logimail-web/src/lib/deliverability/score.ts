// Deliverability_Engine scoring (Requirement 2.5, 18.2 / Property 10).
// Pure + deterministic so the 0–100 integer bound can be property-tested.

export type DnsState = 'pass' | 'warning' | 'fail' | 'unknown';

export type ScoreInput = {
  mx: DnsState;
  spf: DnsState;
  dkim: DnsState;
  dmarc: DnsState;
  ptr: DnsState;
  bimi: DnsState;
  mtaSts: DnsState;
  /** Optional: hard-bounce rate over the trailing window, 0..1. */
  bounceRate?: number;
  /** Optional: inbox placement rate from the last seed test, 0..1. */
  inboxRate?: number;
};

// Weights sum to 100 so a fully-passing domain (no penalties) scores 100.
const WEIGHTS: Record<keyof Omit<ScoreInput, 'bounceRate' | 'inboxRate'>, number> = {
  mx: 15,
  spf: 20,
  dkim: 20,
  dmarc: 20,
  ptr: 10,
  bimi: 5,
  mtaSts: 10,
};

const MAX_BOUNCE_PENALTY = 20;
const MAX_PLACEMENT_PENALTY = 15;

function stateFactor(state: DnsState): number {
  switch (state) {
    case 'pass':
      return 1;
    case 'warning':
      return 0.5;
    default:
      return 0; // fail | unknown
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Compute an integer deliverability score in [0, 100]. Base score is the
 * weighted sum of authentication states; bounce rate and (low) inbox placement
 * apply bounded penalties. Always returns a clamped integer.
 */
export function computeDeliverabilityScore(input: ScoreInput): number {
  let base = 0;
  for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    base += WEIGHTS[key] * stateFactor(input[key]);
  }

  let penalty = 0;
  if (typeof input.bounceRate === 'number') {
    penalty += Math.round(clamp01(input.bounceRate) * MAX_BOUNCE_PENALTY);
  }
  if (typeof input.inboxRate === 'number') {
    // Lower inbox placement => larger penalty (full placement => none).
    penalty += Math.round((1 - clamp01(input.inboxRate)) * MAX_PLACEMENT_PENALTY);
  }

  const score = Math.round(base) - penalty;
  return Math.max(0, Math.min(100, score));
}
