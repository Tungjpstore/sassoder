import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const createRoute = readSource('../../app/api/logimail/team/invites/route.ts');
const acceptRoute = readSource('../../app/api/logimail/auth/invite/route.ts');
const inviteForm = readSource('../../components/request-forms.tsx');
const inviteAuthForm = readSource('../../components/auth-forms.tsx');
const migration = readSource('../../../../../supabase/migrations/20260722133000_logimail_workspace_invites.sql');
const operationMigration = readSource('../../../../../supabase/migrations/20260723103000_logimail_invite_operation_journal.sql');

test('team invite creation is owner/admin scoped and never dispatches email implicitly', () => {
  assert.match(createRoute, /requireAuth\(request, 'write'\)/);
  assert.match(createRoute, /\['owner', 'admin'\]/);
  assert.match(createRoute, /enforceRateLimit\(request, 'team-invite-create'/);
  assert.match(createRoute, /mailbox\.email_address !== targetEmail/);
  assert.match(createRoute, /hashWorkspaceInviteCode\(code\)/);
  assert.match(createRoute, /delivery: 'manual_secure_channel_required'/);
  assert.doesNotMatch(createRoute, /inviteUserByEmail|sendMail|nodemailer/i);
});

test('invite acceptance claims the exact target through the journal before external side effects', () => {
  const claimAt = acceptRoute.indexOf("store.rpc('claim_workspace_invite_operation'");
  const providerAt = acceptRoute.indexOf('await updateBillionMailMailboxPassword(providerInput)');
  const authAt = acceptRoute.indexOf('auth.admin.updateUserById');
  assert.ok(claimAt >= 0 && providerAt > claimAt && authAt > providerAt);
  assert.match(acceptRoute, /target_token_hash: hashWorkspaceInviteCode\(code\)/);
  assert.match(acceptRoute, /requested_email: email/);
  assert.match(acceptRoute, /new_lease_token: leaseToken/);
  assert.match(acceptRoute, /externalMutationUncertain/);
  assert.match(acceptRoute, /coordinationUncertain/);
});

test('invite acceptance uses the durable journal and an atomic database commit', () => {
  const providerAt = acceptRoute.indexOf('await updateBillionMailMailboxPassword(providerInput)');
  const authAt = acceptRoute.indexOf('auth.admin.updateUserById');
  const commitAt = acceptRoute.indexOf("store.rpc('commit_workspace_invite_operation'");

  assert.ok(providerAt >= 0 && providerAt < authAt && authAt < commitAt);
  assert.match(acceptRoute, /claim_workspace_invite_operation/);
  assert.match(acceptRoute, /touch_workspace_invite_operation/);
  assert.match(acceptRoute, /bind_workspace_invite_operation_user/);
  assert.match(acceptRoute, /abort_workspace_invite_operation/);
  assert.match(acceptRoute, /require_workspace_invite_recovery/);
  assert.match(acceptRoute, /prepareMailboxCredentials/);
  assert.match(acceptRoute, /password: previousPassword/);
  assert.doesNotMatch(acceptRoute, /\.update\(\{ status: 'processing'/);
  assert.doesNotMatch(acceptRoute, /bump_mailbox_session_version/);
  assert.match(operationMigration, /commit_workspace_invite_operation/);
});

test('invite UI submits to real server routes rather than changing Supabase user state directly', () => {
  assert.match(inviteForm, /TeamInviteForm/);
  assert.match(inviteForm, /'\/api\/logimail\/team\/invites'/);
  assert.match(inviteAuthForm, /'\/api\/logimail\/auth\/invite'/);
  const inviteFormSource = inviteAuthForm.slice(inviteAuthForm.indexOf('export function InviteAcceptForm'));
  assert.doesNotMatch(inviteFormSource, /auth\.updateUser/);
});

test('workspace invite persistence stores only a hashed code and blocks browser reads', () => {
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /status in \('active', 'processing', 'accepted', 'revoked', 'expired'\)/);
  assert.match(migration, /alter table logimail\.workspace_invites enable row level security/);
  assert.match(migration, /revoke all on table logimail\.workspace_invites from anon, authenticated/);
});
