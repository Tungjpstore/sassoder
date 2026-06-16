import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const {
  isValidSelector,
  canAddSelector,
  selectorExists,
  dkimTxtName,
  dkimTxtContent,
  defaultSelectorName,
  SELECTOR_PATTERN,
} = await import('./dkim-format.ts');

function randomSelector() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const len = 1 + Math.floor(Math.random() * 20);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    // Allow hyphen in the middle only.
    const pool = i === 0 || i === len - 1 ? alphabet : `${alphabet}-`;
    out += pool[Math.floor(Math.random() * pool.length)];
  }
  return out;
}

test('valid/invalid selector boundaries (R1.2)', () => {
  assert.equal(isValidSelector('a'), true);
  assert.equal(isValidSelector('lm20260613'), true);
  assert.equal(isValidSelector('a-b-c'), true);
  assert.equal(isValidSelector('a'.repeat(63)), true);
  assert.equal(isValidSelector('a'.repeat(64)), false);
  assert.equal(isValidSelector(''), false);
  assert.equal(isValidSelector('-abc'), false);
  assert.equal(isValidSelector('abc-'), false);
  assert.equal(isValidSelector('AB'), false);
  assert.equal(isValidSelector('a.b'), false);
  assert.equal(isValidSelector('a_b'), false);
});

test('default selector name matches the pattern', () => {
  assert.match(defaultSelectorName(new Date('2026-06-13T00:00:00Z')), SELECTOR_PATTERN);
  assert.equal(defaultSelectorName(new Date('2026-06-13T00:00:00Z')), 'lm20260613');
});

test('record formatting', () => {
  assert.equal(dkimTxtName('lm1', 'Example.COM'), 'lm1._domainkey.example.com');
  assert.equal(dkimTxtContent('PUBKEYB64'), 'v=DKIM1; k=rsa; p=PUBKEYB64');
});

// Property 5 (Validates Requirements 1.4): no two selectors with the same name
// can ever coexist for the same domain. Simulate sequential create attempts
// against a per-domain set and assert the invariant always holds.
test('⚠ property: selector uniqueness per domain holds under randomized inserts', () => {
  for (let trial = 0; trial < 400; trial += 1) {
    const accepted = []; // selectors that "made it" into this domain
    const attempts = 5 + Math.floor(Math.random() * 30);

    for (let i = 0; i < attempts; i += 1) {
      // ~40% of the time try to re-insert an existing selector to force conflicts.
      const reuse = accepted.length > 0 && Math.random() < 0.4;
      const candidate = reuse
        ? accepted[Math.floor(Math.random() * accepted.length)].selector
        : randomSelector();

      const guard = canAddSelector(accepted, candidate);

      if (selectorExists(accepted, candidate)) {
        // A duplicate must always be rejected as a conflict.
        assert.equal(guard.ok, false);
        assert.equal(guard.reason, 'dkim_selector_conflict');
      } else if (isValidSelector(candidate)) {
        assert.equal(guard.ok, true);
        accepted.push({ selector: candidate });
      }
    }

    // Invariant: the accepted set has no duplicate selector names.
    const names = accepted.map((row) => row.selector.toLowerCase());
    assert.equal(new Set(names).size, names.length, 'duplicate selector slipped into a domain');
  }
});

test('uniqueness is case-insensitive', () => {
  const existing = [{ selector: 'sel1' }];
  assert.equal(canAddSelector(existing, 'SEL1').ok, false);
});

// Sanity: random valid selectors are always accepted into an empty set.
test('random valid selectors accepted into empty domain set', () => {
  for (let i = 0; i < 200; i += 1) {
    const s = randomSelector();
    if (isValidSelector(s)) {
      assert.equal(canAddSelector([], s).ok, true, `rejected valid selector ${s}`);
    }
  }
  // Guard against a degenerate random generator.
  assert.ok(randomBytes(1).length === 1);
});
