import test from 'node:test';
import assert from 'node:assert/strict';

const { authorizeRole, isStateChangingAction, ADMIN_ROLES, ALL_ROLES } = await import('./rbac.ts');
const { evaluateFixedWindow, RATE_LIMIT_PRESETS } = await import('./rate-window.ts');
const { isSendRateExceeded, DEFAULT_SEND_RATE_LIMIT_PER_HOUR, sendRateWindowStart, SEND_RATE_WINDOW_MS } =
  await import('./abuse.ts');

// --------------------------------------------------------------------------
// RBAC matrix (R15)
// --------------------------------------------------------------------------

test('state-changing classification', () => {
  assert.equal(isStateChangingAction('read'), false);
  assert.equal(isStateChangingAction('write'), true);
  assert.equal(isStateChangingAction('dangerous'), true);
});

test('viewer is read-only even when allow-listed (R15.2)', () => {
  assert.equal(authorizeRole('viewer', 'read', ALL_ROLES).ok, true);
  const write = authorizeRole('viewer', 'write', ALL_ROLES);
  assert.equal(write.ok, false);
  assert.equal(write.reason, 'viewer_readonly');
  assert.equal(authorizeRole('viewer', 'dangerous', ALL_ROLES).ok, false);
});

test('admin-console actions require owner/admin (R15.4)', () => {
  for (const role of ['owner', 'admin']) {
    assert.equal(authorizeRole(role, 'write', ADMIN_ROLES).ok, true, `${role} should pass`);
  }
  for (const role of ['member', 'viewer']) {
    const result = authorizeRole(role, 'write', ADMIN_ROLES);
    assert.equal(result.ok, false, `${role} should be denied`);
    assert.equal(result.reason, 'role_not_allowed');
  }
});

test('full role x action matrix is internally consistent', () => {
  for (const role of ALL_ROLES) {
    for (const action of ['read', 'write', 'dangerous']) {
      const result = authorizeRole(role, action, ALL_ROLES);
      if (role === 'viewer' && action !== 'read') {
        assert.equal(result.ok, false);
      } else {
        assert.equal(result.ok, true);
      }
    }
  }
});

// --------------------------------------------------------------------------
// Rate-limit fixed window (R16.1, R16.2)
// --------------------------------------------------------------------------

test('fixed window allows up to the limit then rejects with retry-after', () => {
  const { limit, windowMs } = RATE_LIMIT_PRESETS.mailboxUnlock; // 8 / 60s
  const start = 1_000_000;
  let bucket;
  for (let i = 1; i <= limit; i += 1) {
    const decision = evaluateFixedWindow(bucket, start, limit, windowMs);
    assert.equal(decision.allowed, true, `request ${i} should be allowed`);
    bucket = decision.bucket;
  }
  // The (limit+1)-th request within the window is rejected.
  const overflow = evaluateFixedWindow(bucket, start + 5_000, limit, windowMs);
  assert.equal(overflow.allowed, false);
  assert.ok(overflow.retryAfterSeconds >= 1);
  assert.ok(overflow.retryAfterSeconds <= Math.ceil(windowMs / 1000));
});

test('window resets after expiry', () => {
  const { limit, windowMs } = RATE_LIMIT_PRESETS.adminAction; // 30 / 60s
  const start = 2_000_000;
  let bucket = { count: limit, resetAt: start + windowMs };
  // Immediately after, still within window -> rejected.
  assert.equal(evaluateFixedWindow(bucket, start + 1, limit, windowMs).allowed, false);
  // After the window passes -> fresh allow at count 1.
  const fresh = evaluateFixedWindow(bucket, start + windowMs + 1, limit, windowMs);
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.bucket.count, 1);
});

// --------------------------------------------------------------------------
// Anti-abuse threshold (R16.3)
// --------------------------------------------------------------------------

test('send-rate threshold trips at the configured ceiling', () => {
  assert.equal(DEFAULT_SEND_RATE_LIMIT_PER_HOUR, 300);
  assert.equal(isSendRateExceeded(0), false);
  assert.equal(isSendRateExceeded(299), false);
  assert.equal(isSendRateExceeded(300), true);
  assert.equal(isSendRateExceeded(5000), true);
  // Custom threshold.
  assert.equal(isSendRateExceeded(10, 10), true);
  assert.equal(isSendRateExceeded(9, 10), false);
});

test('window start is one hour before now', () => {
  const now = 10_000_000_000;
  const startIso = sendRateWindowStart(now);
  assert.equal(Date.parse(startIso), now - SEND_RATE_WINDOW_MS);
});
