import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const sessionRoute = readSource('../../app/api/logimail/mail/session/route.ts');
const authForms = readSource('../../components/auth-forms.tsx');
const ssoClient = readSource('../sso-client.ts');

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('mail-session DELETE clears the credential cookie even after auth expiry', () => {
  const deleteRoute = sessionRoute.slice(sessionRoute.indexOf('export async function DELETE'));
  assert.doesNotMatch(deleteRoute, /requireAuth/);
  assert.match(deleteRoute, /response\.cookies\.set\(MAIL_SESSION_COOKIE, '', emptyMailSessionCookieOptions\(\)\)/);
  assert.match(deleteRoute, /cache-control', 'no-store'/);
});

test('browser logout always settles loading and redirects from a finally block', () => {
  const signOut = functionSource(authForms, '  async function signOut()', '\n\n  return (');
  assert.match(signOut, /logoutCurrentOrigin\(\)/);
  assert.match(signOut, /finally\s*{[\s\S]*?setLoading\(false\)[\s\S]*?window\.location\.replace\(nextLogoutPageUrl\(\)\)/);
  assert.match(ssoClient, /fetch\('\/api\/logimail\/mail\/session',[\s\S]*?method: 'DELETE'/);
  assert.match(ssoClient, /auth\/sso\/revoke/);
  assert.match(ssoClient, /Promise\.allSettled\(tasks\)/);
});
