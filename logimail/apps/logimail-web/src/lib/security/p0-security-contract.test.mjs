import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const adminAccess = readSource('../admin-access.ts');
const securityCodes = readSource('../security-codes.ts');
const mailSession = readSource('../mail-session.ts');
const mailApi = readSource('../mail-api.ts');
const resetRoute = readSource('../../app/api/logimail/auth/reset-password/route.ts');
const loginRoute = readSource('../../app/api/logimail/auth/login/route.ts');
const mailSessionRoute = readSource('../../app/api/logimail/mail/session/route.ts');
const controlClient = readSource('../../components/control/control-client.tsx');
const rateLimit = readSource('../rate-limit.ts');
const sessionSecurity = readSource('./session.ts');
const sessionsRoute = readSource('../../app/api/logimail/admin/sessions/route.ts');
const grantAdmin = readSource('../../../scripts/grant-admin.mjs');

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('global admin resolution uses platform_role and never the workspace role', () => {
  const resolver = functionSource(adminAccess, 'export async function resolveAdminProfile', '/**\n * Guard for admin-only');
  assert.match(resolver, /select\('id,email,full_name,platform_role,account_status'\)/);
  assert.match(resolver, /isPlatformRole\(profile\.platform_role\)/);
  assert.doesNotMatch(resolver, /profile\.role\b/);
});

test('platform admin bootstrap grants the explicit platform role and records an audit event', () => {
  assert.match(grantAdmin, /platform_role: 'platform_owner'/);
  assert.match(grantAdmin, /logimail\.platform_role_bootstrapped/);
  assert.doesNotMatch(grantAdmin, /platform_role:\s*(?:profile\.)?role\b/);
});

test('state-changing platform admin operations pass through rollout-safe MFA enforcement', () => {
  const guard = functionSource(adminAccess, 'export async function requireAdmin', 'export function actorLabel');
  assert.match(guard, /if \(action !== 'read'\)/);
  assert.match(guard, /enforceConsoleMfa\(\{ userId: auth\.user\.id, token: auth\.token \}\)/);
  assert.match(sessionSecurity, /LOGIMAIL_ADMIN_MFA_MODE \?\? 'enrolled'/);
  assert.match(sessionSecurity, /mode === 'off'/);
  assert.match(sessionSecurity, /mode === 'required'/);
});

test('session revoke never accepts a client JWT for an arbitrary target', () => {
  assert.doesNotMatch(sessionsRoute, /stringField\(body, 'token'/);
  assert.match(sessionsRoute, /revokeUserSessions\(\{ userId, actorId: admin\.user\.id \}\)/);
  assert.match(sessionSecurity, /rpc\('revoke_user_sessions', \{ target_user_id: input\.userId, actor_user_id: input\.actorId \}\)/);
  assert.doesNotMatch(sessionSecurity, /admin\.auth\.admin\.signOut\(input\.token/);
});

test('password reset codes are created and consumed for one exact target email', () => {
  assert.match(
    securityCodes,
    /if \(purpose === 'password_reset'\)[\s\S]*?!domain \|\| !targetEmail \|\| targetEmail\.split\('@'\)\[1\] !== domain/,
  );
  assert.match(
    securityCodes,
    /function matchesTargetEmail[\s\S]*?row\.target_email === requestedEmail/,
  );
  assert.match(
    securityCodes,
    /!matchesPurpose[\s\S]*?!matchesDomain[\s\S]*?!matchesTargetEmail/,
  );
  assert.match(
    resetRoute,
    /consumeSecurityCode\(\{ code: securityCode, domain: domain\.domain, email, userId: profile\.id as string, purpose: 'password_reset' \}\)/,
  );
});

test('active security-code listings never expose plaintext codes', () => {
  assert.doesNotMatch(securityCodes, /code:\s*displayCodeFromRow\(row\)/);
  assert.doesNotMatch(controlClient, /code\.code\b/);
  assert.match(controlClient, /codeHint/);
});

test('login applies account and IP rate limits as independent dimensions', () => {
  assert.match(loginRoute, /enforceRateLimit\(request, 'auth-login-ip'/);
  assert.match(loginRoute, /enforceIdentityRateLimit\('auth-login-email', emailHash/);
  assert.match(rateLimit, /export function enforceIdentityRateLimit/);
  assert.doesNotMatch(loginRoute, /enforceRateLimit\(request, `auth-login-email:/);
});

test('password reset claims the target-bound code before provider side effects', () => {
  const consumeAt = resetRoute.indexOf('const consumedCode = await consumeSecurityCode');
  const providerAt = resetRoute.indexOf('await updateBillionMailMailboxPassword');
  const authAt = resetRoute.indexOf('await serviceStore.auth.admin.updateUserById');
  assert.ok(consumeAt >= 0 && consumeAt < providerAt && providerAt < authAt);
  assert.match(resetRoute, /enforceRateLimit\(request, 'auth-password-reset'/);
});

test('mail sessions carry the mailbox version and APIs reject stale versions', () => {
  assert.match(mailSession, /const MAIL_SESSION_VERSION = 2/);
  assert.match(mailSession, /sessionVersion: number/);
  assert.match(mailSession, /session\.sessionVersion !== input\.sessionVersion/);
  assert.match(
    mailApi,
    /mailSessionBelongsTo\(session, \{ userId: auth\.user\.id, mailboxId: mailbox\.id, sessionVersion: mailbox\.sessionVersion, email: mailbox\.emailAddress \}\)/,
  );
  assert.match(resetRoute, /serviceStore\.rpc\('revoke_user_sessions'/);
});

test('password reset code rotation is scoped to the target mailbox', () => {
  assert.match(
    securityCodes,
    /revokeActiveSiblingSecurityCodes\(\{[\s\S]*targetEmail,[\s\S]*purpose,[\s\S]*actor:/,
  );
  assert.match(
    securityCodes,
    /input\.purpose === 'password_reset'[\s\S]*?domainScopedQuery\.eq\('target_email', input\.targetEmail\)/,
  );
});

test('mail session status rejects a cookie with a stale mailbox version', () => {
  assert.match(
    mailSessionRoute,
    /mailSessionBelongsTo\(session, \{[\s\S]*sessionVersion: mailbox\.sessionVersion[\s\S]*email: mailbox\.emailAddress/,
  );
  assert.match(mailSessionRoute, /unlocked: Boolean\(current\)/);
});

test('admin UI requires and sends the target mailbox for reset codes', () => {
  assert.match(controlClient, /targetEmail: string \| null/);
  assert.match(controlClient, /Email mailbox cần reset/);
  assert.match(
    controlClient,
    /targetEmail: purpose === 'password_reset' \? targetEmail\.trim\(\) \|\| undefined : undefined/,
  );
});
