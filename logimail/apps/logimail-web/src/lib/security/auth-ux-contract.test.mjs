import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const authForms = readFileSync(new URL('../../components/auth-forms.tsx', import.meta.url), 'utf8');
const authExperience = readFileSync(new URL('../../components/auth-experience.tsx', import.meta.url), 'utf8');

function componentSource(startMarker, endMarker) {
  const start = authForms.indexOf(startMarker);
  const end = authForms.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return authForms.slice(start, end);
}

test('login remains available with a full email when the domain query is temporarily unavailable', () => {
  const login = componentSource('export function AuthLoginForm', 'export function AuthRegisterForm');
  assert.match(login, /domainStatus === 'unavailable'/);
  assert.match(login, /type="email"[\s\S]*?autoComplete="username"/);
  assert.match(login, /Bạn vẫn có thể đăng nhập bằng địa chỉ email đầy đủ/);
  assert.match(login, /!acceptsFullEmail && domains\.length === 0/);
});

test('accepted invite reports activation success when automatic login fails', () => {
  const invite = componentSource('export function InviteAcceptForm', 'export function SignOutButton');
  const acceptAt = invite.indexOf("logimailAuthRequest<{ email: string }>('/api/logimail/auth/invite'");
  const loginAt = invite.indexOf('logimailPasswordLogin', acceptAt);
  const completedAt = invite.indexOf('setCompletedEmail(result.email)', loginAt);

  assert.ok(acceptAt >= 0 && acceptAt < loginAt && loginAt < completedAt);
  assert.match(invite, /Tài khoản \$\{result\.email\} đã được kích hoạt/);
  assert.match(invite, /Đăng nhập tài khoản đã kích hoạt/);
});

test('forgot password keeps working with a temporary domain query outage', () => {
  const forgot = componentSource('export function ForgotPasswordForm', 'export function InviteAcceptForm');
  assert.match(authExperience, /ForgotPasswordForm domains=\{domains\} domainStatus=\{status\}/);
  assert.match(forgot, /domainStatus === 'unavailable'/);
  assert.match(forgot, /địa chỉ email đầy đủ để khôi phục/);
  assert.match(forgot, /!acceptsFullEmail && domains\.length === 0/);
});

test('forgot password carries a safe post-reset destination without putting email in the URL', () => {
  const forgot = componentSource('export function ForgotPasswordForm', 'export function InviteAcceptForm');
  assert.match(forgot, /safeNextPath\(searchParams\.get\('next'\), \{ disallowAuthRoutes: true \}\)/);
  assert.match(forgot, /href=\{`\/auth\/login\?next=\$\{encodeURIComponent\(nextPath\)\}`\}/);
  assert.doesNotMatch(forgot, /auth\/login\?email=/);
});
