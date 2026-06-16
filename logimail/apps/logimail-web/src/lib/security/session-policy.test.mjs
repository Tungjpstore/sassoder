import test from 'node:test';
import assert from 'node:assert/strict';

const { isSessionIdleExpired, requiresSecondFactor, readAalClaim, SESSION_IDLE_TIMEOUT_MS } = await import('./session-policy.ts');

test('idle timeout default 8h (R17.5)', () => {
  assert.equal(SESSION_IDLE_TIMEOUT_MS, 8 * 3600_000);
  const now = 1_000_000_000_000;
  assert.equal(isSessionIdleExpired(now - 7 * 3600_000, now), false);
  assert.equal(isSessionIdleExpired(now - 9 * 3600_000, now), true);
});

test('MFA gating (R17.3)', () => {
  assert.equal(requiresSecondFactor({ mfaEnabled: false, aal: 'aal1' }), false);
  assert.equal(requiresSecondFactor({ mfaEnabled: true, aal: 'aal1' }), true);
  assert.equal(requiresSecondFactor({ mfaEnabled: true, aal: 'aal2' }), false);
  assert.equal(requiresSecondFactor({ mfaEnabled: true, aal: null }), true);
});

test('reads aal claim from a JWT payload', () => {
  const payload = Buffer.from(JSON.stringify({ aal: 'aal2', sub: 'user' }), 'utf8').toString('base64url');
  const token = `header.${payload}.signature`;
  assert.equal(readAalClaim(token), 'aal2');
  assert.equal(readAalClaim('not-a-jwt'), null);
  assert.equal(readAalClaim(null), null);
});
