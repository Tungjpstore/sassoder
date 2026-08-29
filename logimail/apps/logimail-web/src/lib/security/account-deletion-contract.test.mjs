import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(relativeUrl) {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8');
}

test('account deletion is re-authenticated, origin-bound, MFA-gated and audited', () => {
  const route = source('../../app/api/logimail/account/delete/route.ts');
  const form = source('../../components/account-delete-form.tsx');

  assert.match(route, /trustedSsoRequestContext\(request\)/);
  assert.doesNotMatch(route, /new URL\(request\.url\)\.origin/);
  assert.match(route, /requireAuth\(request, 'dangerous'\)/);
  assert.match(route, /enforceConsoleMfa\(/);
  assert.match(route, /signInWithPassword\(\{ email: auth\.user\.email, password \}\)/);
  assert.match(route, /workspace_ownership_transfer_required/);
  assert.match(route, /deleteBillionMailMailbox\(/);
  assert.match(route, /from\('workspace_invites'\)/);
  assert.match(route, /from\('mailbox_permissions'\)/);
  assert.match(route, /\.delete\(\)/);
  assert.match(route, /invited_by/);
  assert.match(route, /user_id/);
  assert.match(route, /encrypted_imap_password: null/);
  assert.match(route, /revokeUserSessions\(/);
  assert.match(route, /auth\.admin\.deleteUser\(auth\.user\.id\)/);
  assert.match(route, /action: 'account\.delete'/);

  assert.match(form, /x-logimail-confirm/);
  assert.match(form, /useAdminMfaStepUp/);
  assert.match(form, /current-password/);
  assert.match(form, /ACCOUNT_DELETE_CONFIRMATION/);
  assert.match(form, /\/api\/logimail\/account\/delete/);
  assert.doesNotMatch(form, /window\.(?:confirm|prompt)\s*\(/);
});
