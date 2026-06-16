import test from 'node:test';
import assert from 'node:assert/strict';

const { slaTargetMs, isPendingOverdue, elapsedMs, bounceRate, isBounceRateBreached, BOUNCE_RATE_THRESHOLD, SLA_TARGET_MS } =
  await import('./sla.ts');

test('SLA targets: account 4h, domain 8h, mailbox 2h (R11.4)', () => {
  assert.equal(slaTargetMs('account'), 4 * 3600_000);
  assert.equal(slaTargetMs('domain'), 8 * 3600_000);
  assert.equal(slaTargetMs('mailbox'), 2 * 3600_000);
  assert.equal(SLA_TARGET_MS.mailbox, 2 * 3600_000);
});

test('pending overdue detection', () => {
  const now = Date.parse('2026-06-13T12:00:00Z');
  const threeHoursAgo = new Date(now - 3 * 3600_000).toISOString();
  // mailbox target 2h -> overdue; account target 4h -> not overdue.
  assert.equal(isPendingOverdue(threeHoursAgo, 'mailbox', now), true);
  assert.equal(isPendingOverdue(threeHoursAgo, 'account', now), false);
});

test('elapsed time is non-negative', () => {
  assert.equal(elapsedMs('2026-06-13T10:00:00Z', '2026-06-13T12:00:00Z'), 2 * 3600_000);
  assert.equal(elapsedMs('2026-06-13T12:00:00Z', '2026-06-13T10:00:00Z'), 0);
});

test('bounce rate threshold at 5% (R11.2)', () => {
  assert.equal(BOUNCE_RATE_THRESHOLD, 0.05);
  assert.equal(bounceRate(0, 0), 0);
  assert.equal(bounceRate(6, 100), 0.06);
  assert.equal(isBounceRateBreached(6, 100), true);
  assert.equal(isBounceRateBreached(5, 100), false); // exactly 5% is not > 5%
  assert.equal(isBounceRateBreached(0, 0), false);
});
