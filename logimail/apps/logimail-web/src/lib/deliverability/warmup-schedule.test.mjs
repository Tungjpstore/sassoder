import test from 'node:test';
import assert from 'node:assert/strict';

const {
  scheduledLimitForDay,
  isWarmupComplete,
  advanceWarmup,
  quotaAfterReset,
  isQuotaExceeded,
  consumeQuota,
  WARMUP_DEFAULT_START,
  WARMUP_DEFAULT_MULTIPLIER,
} = await import('./warmup-schedule.ts');

test('defaults: start 50, double each day', () => {
  assert.equal(WARMUP_DEFAULT_START, 50);
  assert.equal(WARMUP_DEFAULT_MULTIPLIER, 2);
  const plan = { startLimit: 50, multiplier: 2, target: 10000, day: 1 };
  assert.equal(scheduledLimitForDay({ ...plan, day: 1 }), 50);
  assert.equal(scheduledLimitForDay({ ...plan, day: 2 }), 100);
  assert.equal(scheduledLimitForDay({ ...plan, day: 3 }), 200);
});

test('limit is capped at target (never exceeds)', () => {
  const plan = { startLimit: 50, multiplier: 2, target: 120, day: 10 };
  assert.equal(scheduledLimitForDay(plan), 120);
  assert.equal(isWarmupComplete(plan), true);
});

// Property 6 (Validates 4.3, 18.3): scheduled limit is monotonic non-decreasing
// in day and bounded by target, for randomized plans.
test('⚠ property: warm-up schedule is monotonic and bounded by target', () => {
  for (let i = 0; i < 600; i += 1) {
    const startLimit = 1 + Math.floor(Math.random() * 200);
    const multiplier = 1 + Math.random() * 3; // [1,4)
    const target = startLimit + Math.floor(Math.random() * 100000);
    const plan = { startLimit, multiplier, target, day: 1 };

    let prev = -1;
    for (let day = 1; day <= 40; day += 1) {
      const limit = scheduledLimitForDay({ ...plan, day });
      assert.ok(limit >= prev, `limit decreased at day ${day}`);
      assert.ok(limit <= target, `limit exceeded target at day ${day}`);
      assert.ok(Number.isInteger(limit));
      prev = limit;
    }
  }
});

test('advanceWarmup completes at target and stops incrementing', () => {
  let plan = { startLimit: 50, multiplier: 2, target: 200, day: 1 };
  let result = advanceWarmup(plan); // day 2 -> 100
  assert.equal(result.status, 'active');
  plan = { ...plan, day: result.day };
  result = advanceWarmup(plan); // day 3 -> 200 = target
  assert.equal(result.status, 'completed');
  assert.equal(result.limit, 200);
});

// --- Quota properties

test('quota resets on date rollover', () => {
  const state = { dailyLimit: 100, usedToday: 80, usageDate: '2026-06-12' };
  const reset = quotaAfterReset(state, '2026-06-13');
  assert.equal(reset.usedToday, 0);
  assert.equal(reset.usageDate, '2026-06-13');
  // Same day: unchanged.
  assert.equal(quotaAfterReset(state, '2026-06-12').usedToday, 80);
});

test('⚠ property: quota usage is monotonic and bounded by limit within a day', () => {
  for (let i = 0; i < 300; i += 1) {
    const limit = Math.floor(Math.random() * 50);
    let state = { dailyLimit: limit, usedToday: 0, usageDate: '2026-06-13' };
    let allowedCount = 0;
    let prevUsed = 0;

    for (let attempt = 0; attempt < limit + 10; attempt += 1) {
      const { state: next, allowed } = consumeQuota(state, '2026-06-13');
      assert.ok(next.usedToday >= prevUsed, 'usedToday decreased');
      assert.ok(next.usedToday <= limit, 'usedToday exceeded limit');
      if (allowed) allowedCount += 1;
      prevUsed = next.usedToday;
      state = next;
    }
    // Exactly `limit` sends are permitted before exhaustion.
    assert.equal(allowedCount, limit);
    assert.equal(isQuotaExceeded(state), true);
  }
});

// Property 9 (Validates 4.3, 20.3): consuming one domain's quota never affects another.
test('⚠ property: per-domain quota isolation', () => {
  for (let i = 0; i < 300; i += 1) {
    const today = '2026-06-13';
    let a = { dailyLimit: 5, usedToday: 0, usageDate: today };
    let b = { dailyLimit: 5, usedToday: 0, usageDate: today };

    // Exhaust domain A entirely.
    for (let k = 0; k < 10; k += 1) a = consumeQuota(a, today).state;
    assert.equal(isQuotaExceeded(a), true);

    // Domain B is untouched and still fully available.
    assert.equal(b.usedToday, 0);
    assert.equal(isQuotaExceeded(b), false);
    const first = consumeQuota(b, today);
    assert.equal(first.allowed, true);
  }
});
