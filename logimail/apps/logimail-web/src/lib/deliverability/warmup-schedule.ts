// Pure warm-up scheduling + quota math (Requirement 4, 18 / Property 6, 9).
// No imports so the monotonic-and-bounded property can be tested directly.

export const WARMUP_DEFAULT_START = 50;
export const WARMUP_DEFAULT_MULTIPLIER = 2;

export type WarmupPlanShape = {
  startLimit: number;
  multiplier: number;
  target: number;
  day: number; // 1-based
};

/**
 * Scheduled daily send limit for a given warm-up day (R4.1, R4.2):
 *   limit(day) = floor(startLimit * multiplier^(day-1)), capped at target.
 * Monotonic non-decreasing in `day` and never exceeds `target` (Property 6).
 */
export function scheduledLimitForDay(plan: WarmupPlanShape): number {
  const day = Math.max(1, Math.floor(plan.day));
  const raw = plan.startLimit * Math.pow(plan.multiplier, day - 1);
  const floored = Number.isFinite(raw) ? Math.floor(raw) : plan.target;
  return Math.min(plan.target, Math.max(0, floored));
}

/** A plan is complete once the scheduled limit reaches the target (R4.4). */
export function isWarmupComplete(plan: WarmupPlanShape): boolean {
  return scheduledLimitForDay(plan) >= plan.target;
}

/** Compute the next day + status when advancing a warm-up plan by one day. */
export function advanceWarmup(plan: WarmupPlanShape): { day: number; limit: number; status: 'active' | 'completed' } {
  if (isWarmupComplete(plan)) {
    return { day: plan.day, limit: plan.target, status: 'completed' };
  }
  const next = { ...plan, day: plan.day + 1 };
  const limit = scheduledLimitForDay(next);
  return { day: next.day, limit, status: isWarmupComplete(next) ? 'completed' : 'active' };
}

// --- Quota math (Property 6 monotonic & bounded, Property 9 per-domain isolation)

export type QuotaState = {
  dailyLimit: number;
  usedToday: number;
  usageDate: string; // ISO date (YYYY-MM-DD)
};

/** Reset `usedToday` to 0 when the stored usage date is not today (R18.3). */
export function quotaAfterReset(state: QuotaState, today: string): QuotaState {
  if (state.usageDate === today) return state;
  return { ...state, usedToday: 0, usageDate: today };
}

export function isQuotaExceeded(state: QuotaState): boolean {
  return state.usedToday >= state.dailyLimit;
}

/** Consume one unit of quota; bounded so usedToday never exceeds dailyLimit+0. */
export function consumeQuota(state: QuotaState, today: string): { state: QuotaState; allowed: boolean } {
  const reset = quotaAfterReset(state, today);
  if (isQuotaExceeded(reset)) return { state: reset, allowed: false };
  return { state: { ...reset, usedToday: reset.usedToday + 1 }, allowed: true };
}
