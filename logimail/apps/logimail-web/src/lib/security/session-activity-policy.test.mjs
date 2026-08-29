import assert from 'node:assert/strict';
import test from 'node:test';

const {
  readSessionIdClaim,
  resolveSessionActivityRpcResult,
} = await import('./session-activity-policy.ts');

function jwt(payload) {
  return `header.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.signature`;
}

test('reads only a UUID session_id from a verified JWT payload', () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  assert.equal(readSessionIdClaim(jwt({ session_id: sessionId })), sessionId);
  assert.equal(readSessionIdClaim(jwt({ session_id: 'not-a-uuid' })), null);
  assert.equal(readSessionIdClaim(jwt({ sub: 'user-without-session' })), null);
  assert.equal(readSessionIdClaim('not-a-jwt'), null);
  assert.equal(readSessionIdClaim(null), null);
});

test('maps the RPC active result without weakening its contract', () => {
  assert.deepEqual(
    resolveSessionActivityRpcResult(
      [{ allowed: true, status: 'active', last_active_at: '2026-07-23T00:00:00.000Z' }],
      null,
    ),
    { status: 'active', lastActiveAt: '2026-07-23T00:00:00.000Z' },
  );
});

test('maps expired and revoked sessions to authentication denials', () => {
  assert.deepEqual(
    resolveSessionActivityRpcResult([{ allowed: false, status: 'idle_expired', last_active_at: null }], null),
    { status: 'idle_expired', lastActiveAt: null },
  );
  assert.deepEqual(
    resolveSessionActivityRpcResult([{ allowed: false, status: 'revoked', last_active_at: null }], null),
    { status: 'revoked', lastActiveAt: null },
  );
});

test('fails closed as unavailable for RPC errors and malformed responses', () => {
  assert.deepEqual(
    resolveSessionActivityRpcResult(null, { message: 'database unavailable' }),
    { status: 'unavailable', reason: 'database unavailable' },
  );
  assert.deepEqual(
    resolveSessionActivityRpcResult([{ allowed: true, status: 'unexpected', last_active_at: null }], null),
    { status: 'unavailable', reason: 'invalid_session_activity_response' },
  );
});
