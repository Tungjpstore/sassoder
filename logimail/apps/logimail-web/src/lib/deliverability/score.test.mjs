import test from 'node:test';
import assert from 'node:assert/strict';

const { computeDeliverabilityScore } = await import('./score.ts');

const STATES = ['pass', 'warning', 'fail', 'unknown'];

function randomState() {
  return STATES[Math.floor(Math.random() * STATES.length)];
}

test('all-pass scores 100, all-fail scores 0', () => {
  const allPass = computeDeliverabilityScore({ mx: 'pass', spf: 'pass', dkim: 'pass', dmarc: 'pass', ptr: 'pass', bimi: 'pass', mtaSts: 'pass' });
  assert.equal(allPass, 100);
  const allFail = computeDeliverabilityScore({ mx: 'fail', spf: 'fail', dkim: 'fail', dmarc: 'fail', ptr: 'fail', bimi: 'fail', mtaSts: 'fail' });
  assert.equal(allFail, 0);
});

// Property 10 (Validates Requirements 2.5): score is always an integer in [0, 100]
// for every combination of states and any bounce/inbox rate (incl. out-of-range).
test('⚠ property: score is an integer within [0,100] for all inputs', () => {
  for (let i = 0; i < 2000; i += 1) {
    const input = {
      mx: randomState(),
      spf: randomState(),
      dkim: randomState(),
      dmarc: randomState(),
      ptr: randomState(),
      bimi: randomState(),
      mtaSts: randomState(),
    };
    // Randomly include rates, sometimes out of range / NaN to test clamping.
    if (Math.random() < 0.6) input.bounceRate = (Math.random() * 2) - 0.5; // -0.5..1.5
    if (Math.random() < 0.6) input.inboxRate = (Math.random() * 2) - 0.5;
    if (Math.random() < 0.05) input.bounceRate = Number.NaN;

    const score = computeDeliverabilityScore(input);
    assert.ok(Number.isInteger(score), `score not integer: ${score}`);
    assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`);
  }
});

test('higher bounce rate never increases score (monotonic penalty)', () => {
  const base = { mx: 'pass', spf: 'pass', dkim: 'pass', dmarc: 'pass', ptr: 'pass', bimi: 'pass', mtaSts: 'pass' };
  let prev = 101;
  for (const rate of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    const score = computeDeliverabilityScore({ ...base, bounceRate: rate });
    assert.ok(score <= prev, `score increased with higher bounce rate at ${rate}`);
    prev = score;
  }
});

test('worse states never increase score', () => {
  const better = computeDeliverabilityScore({ mx: 'pass', spf: 'pass', dkim: 'pass', dmarc: 'pass', ptr: 'warning', bimi: 'unknown', mtaSts: 'unknown' });
  const worse = computeDeliverabilityScore({ mx: 'fail', spf: 'fail', dkim: 'fail', dmarc: 'fail', ptr: 'fail', bimi: 'fail', mtaSts: 'fail' });
  assert.ok(worse <= better);
});
