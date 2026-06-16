import test from 'node:test';
import assert from 'node:assert/strict';

const { scoreContent, CONTENT_SCORE_THRESHOLD } = await import('./content-score.ts');

test('clean content scores low, spammy content scores high', () => {
  const clean = scoreContent({ subject: 'Quarterly sync notes', text: 'Hi team, here are the notes from our meeting today.' });
  assert.ok(clean.score < CONTENT_SCORE_THRESHOLD);
  assert.equal(clean.needsReview, false);

  const spammy = scoreContent({
    subject: 'CONGRATULATIONS WINNER!!! FREE CASH BONUS',
    text: 'Act now! Click here for your risk-free lottery winner prize. Free bitcoin! Urgent!',
  });
  assert.ok(spammy.score >= CONTENT_SCORE_THRESHOLD);
  assert.equal(spammy.needsReview, true);
  assert.ok(spammy.rules.length > 0);
});

test('needs_review threshold at 5.0 (R8.3)', () => {
  assert.equal(CONTENT_SCORE_THRESHOLD, 5.0);
});

function randomContent() {
  const words = ['hello', 'free', 'team', 'winner', 'meeting', 'click here', 'notes', 'urgent', 'http://x.io', 'project', '$100', '!!!'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const subject = Array.from({ length: Math.floor(Math.random() * 6) }, pick).join(' ');
  const text = Array.from({ length: Math.floor(Math.random() * 30) }, pick).join(' ');
  return { subject, text };
}

// Property 3 (Validates Requirements 8.4): identical content always yields the
// same score + rule set; score is always within [0, 10].
test('⚠ property: content scoring is deterministic and bounded', () => {
  for (let i = 0; i < 1500; i += 1) {
    const content = randomContent();
    const a = scoreContent(content);
    const b = scoreContent({ ...content });
    assert.deepEqual(a, b, 'scoring not deterministic');
    assert.ok(a.score >= 0 && a.score <= 10, `score out of range: ${a.score}`);
    // One-decimal rounding invariant.
    assert.equal(Math.round(a.score * 10) / 10, a.score);
    // needsReview consistent with threshold.
    assert.equal(a.needsReview, a.score >= CONTENT_SCORE_THRESHOLD);
  }
});

test('rule identifiers are returned for contributing factors (R8.2)', () => {
  const result = scoreContent({ subject: '', text: 'free free free winner click here !!!' });
  assert.ok(result.rules.some((r) => r.startsWith('SPAM_PHRASES')));
  assert.ok(result.rules.includes('MISSING_SUBJECT'));
});
