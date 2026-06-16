import test from 'node:test';
import assert from 'node:assert/strict';

const { classifyBounce, shouldSuppress, suppressionReasonFor, isSuppressed } = await import('./bounce-classify.ts');

test('classification precedence (R5.1)', () => {
  assert.equal(classifyBounce({ eventType: 'complaint' }), 'complaint');
  assert.equal(classifyBounce({ reason: 'user marked as abuse' }), 'complaint');
  assert.equal(classifyBounce({ reason: 'listed on blocklist' }), 'blocked');
  assert.equal(classifyBounce({ reason: 'message rejected as spam' }), 'blocked');
  assert.equal(classifyBounce({ smtpCode: '550' }), 'hard');
  assert.equal(classifyBounce({ smtpCode: 421 }), 'soft');
  assert.equal(classifyBounce({ smtpCode: '250' }), 'unknown');
  assert.equal(classifyBounce({}), 'unknown');
});

test('only hard and complaint suppress (R5.3)', () => {
  assert.equal(shouldSuppress('hard'), true);
  assert.equal(shouldSuppress('complaint'), true);
  assert.equal(shouldSuppress('soft'), false);
  assert.equal(shouldSuppress('blocked'), false);
  assert.equal(shouldSuppress('unknown'), false);
  assert.equal(suppressionReasonFor('hard'), 'hard_bounce');
  assert.equal(suppressionReasonFor('complaint'), 'complaint');
  assert.equal(suppressionReasonFor('soft'), null);
});

function randomEmail(i) {
  return `user${i}@example${Math.floor(Math.random() * 5)}.com`;
}

// Property 7 (Validates 5.3, 5.4): any recipient that produces a hard/complaint
// event becomes suppressed and is then blocked from sending; removal re-enables it.
test('⚠ property: suppression enforcement is consistent across random events', () => {
  for (let trial = 0; trial < 500; trial += 1) {
    const suppression = new Set();
    const codes = ['250', '550', '421', '511', '450'];
    const types = [null, 'complaint', 'blocked', 'hard', 'soft'];

    for (let i = 0; i < 40; i += 1) {
      const email = randomEmail(i);
      const signal = {
        eventType: types[Math.floor(Math.random() * types.length)],
        smtpCode: codes[Math.floor(Math.random() * codes.length)],
        reason: Math.random() < 0.2 ? 'abuse complaint' : null,
      };
      const type = classifyBounce(signal);

      if (shouldSuppress(type)) {
        suppression.add(email.toLowerCase());
        // Once suppressed, a send to this recipient must be blocked.
        assert.equal(isSuppressed(suppression, email), true);
        assert.equal(isSuppressed(suppression, email.toUpperCase()), true);
      }

      // A recipient never suppressed must be sendable (unless added earlier).
      if (!suppression.has(email.toLowerCase())) {
        assert.equal(isSuppressed(suppression, email), false);
      }
    }

    // Removal re-enables sending (R5.5).
    for (const email of [...suppression]) {
      suppression.delete(email);
      assert.equal(isSuppressed(suppression, email), false);
    }
  }
});
