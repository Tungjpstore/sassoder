import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const {
  AdminMfaFactorsError,
  AdminMfaVerificationError,
  isMfaRequiredError,
  loadVerifiedTotpFactor,
  selectVerifiedTotpFactor,
  verifyTotpAndRetry,
} = await import('./admin-mfa-step-up.ts');

test('recognizes only the typed mfa_required API error', () => {
  assert.equal(isMfaRequiredError({ code: 'mfa_required' }), true);
  assert.equal(isMfaRequiredError(new Error('mfa_required')), false);
  assert.equal(isMfaRequiredError({ code: 'forbidden' }), false);
});

test('selects a verified TOTP factor and returns null when none exists', () => {
  const factor = { id: 'factor-1', factor_type: 'totp', status: 'verified', friendly_name: 'Admin phone' };
  assert.equal(selectVerifiedTotpFactor([factor]), factor);
  assert.equal(selectVerifiedTotpFactor([]), null);
});

test('factor lookup fails closed when Supabase cannot list factors', async () => {
  await assert.rejects(
    () => loadVerifiedTotpFactor({ listFactors: async () => ({ data: null, error: new Error('network') }) }),
    AdminMfaFactorsError,
  );
});

test('successful TOTP verification retries the guarded action exactly once', async () => {
  let retries = 0;
  const result = await verifyTotpAndRetry({
    mfa: { challengeAndVerify: async () => ({ data: {}, error: null }) },
    factorId: 'factor-1',
    code: '123456',
    retry: async () => {
      retries += 1;
      return 'completed';
    },
  });

  assert.equal(result, 'completed');
  assert.equal(retries, 1);
});

test('failed TOTP verification never invokes the guarded action', async () => {
  let retries = 0;
  await assert.rejects(
    () => verifyTotpAndRetry({
      mfa: { challengeAndVerify: async () => ({ data: null, error: new Error('invalid code') }) },
      factorId: 'factor-1',
      code: '000000',
      retry: async () => {
        retries += 1;
      },
    }),
    AdminMfaVerificationError,
  );
  assert.equal(retries, 0);
});

test('admin MFA UX uses a dialog and never browser prompt for the TOTP code', () => {
  const component = readFileSync(fileURLToPath(new URL('../components/admin-mfa-step-up.tsx', import.meta.url)), 'utf8');
  const control = readFileSync(fileURLToPath(new URL('../components/control/control-client.tsx', import.meta.url)), 'utf8');
  const helper = readFileSync(fileURLToPath(new URL('./admin-mfa-step-up.ts', import.meta.url)), 'utf8');

  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /autoComplete="one-time-code"/);
  assert.match(helper, /listFactors/);
  assert.match(helper, /challengeAndVerify/);
  assert.doesNotMatch(component, /(?:window\.)?prompt\s*\(/);
  assert.match(control, /runWithStepUp\(action\)/);
});
