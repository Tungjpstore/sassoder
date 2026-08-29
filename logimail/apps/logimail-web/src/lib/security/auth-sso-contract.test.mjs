import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const initRoute = read('../../app/api/logimail/auth/sso/init/route.ts');
const startRoute = read('../../app/api/logimail/auth/sso/start/route.ts');
const consumeRoute = read('../../app/api/logimail/auth/sso/consume/route.ts');
const revokeRoute = read('../../app/api/logimail/auth/sso/revoke/route.ts');
const callbackRoute = read('../../app/auth/callback/route.ts');
const middleware = read('../../middleware.ts');
const client = read('../sso-client.ts');
const hostResolver = read('../logimail-hosts.ts');

test('SSO init uses a host-only cookie and public state only', () => {
  assert.match(initRoute, /ssoStateCookieName\(local\)/);
  assert.match(initRoute, /ssoStateCookieOptions\(local/);
  assert.match(initRoute, /transferUrl\.searchParams\.set\('state', state\.state\)/);
  assert.match(initRoute, /transferUrl\.searchParams\.set\('challenge', state\.codeChallenge\)/);
  assert.doesNotMatch(initRoute, /access_token|refresh_token|verifier/);
});

test('SSO start requires bearer auth, origin validation, and stores hashes', () => {
  assert.match(startRoute, /trustedSsoRequestContext\(request\)/);
  assert.match(startRoute, /requireAuth\(request, 'read'\)/);
  assert.match(startRoute, /hashSsoState\(state\)/);
  assert.match(startRoute, /nonce_hash: ticket\.nonceHash/);
  assert.match(startRoute, /code_challenge: codeChallenge/);
  assert.match(startRoute, /redirectUrl\.searchParams\.set\('ticket', ticket\.ticket\)/);
  assert.doesNotMatch(startRoute, /access_token|refresh_token|email:/);
});

test('SSO consume performs CAS before magic-link session creation and clears state', () => {
  const casIndex = consumeRoute.indexOf("store.rpc('consume_sso_handoff'");
  const linkIndex = consumeRoute.indexOf("store.auth.admin.generateLink");
  assert.ok(casIndex >= 0 && linkIndex > casIndex, 'CAS must happen before session creation');
  assert.match(consumeRoute, /verifySsoBrowserState\(stateCookie/);
  assert.match(consumeRoute, /verifySsoHandoffTicket\(ticketValue/);
  assert.match(consumeRoute, /clearSsoStateCookie\(response, local\)/);
  assert.doesNotMatch(consumeRoute, /jsonOk\(\{[^}]*access_token|jsonOk\(\{[^}]*refresh_token/);
});

test('logout revokes active handoffs and middleware only starts SSO for authenticated sessions', () => {
  assert.match(revokeRoute, /revoke_sso_handoffs/);
  assert.match(client, /auth\/sso\/revoke/);
  assert.match(middleware, /authenticated\s*=\s*!error && Boolean\(data\?\.claims\?\.sub\)/);
  assert.match(middleware, /authenticated\s*\?\s*ssoRedirect/);
  assert.match(middleware, /: redirectToHost/);
});

test('middleware and SSO routes share Host-first proxy resolution', () => {
  assert.match(middleware, /hostnameFromHeaders\(request\.headers, request\.nextUrl\.hostname\)/);
  assert.doesNotMatch(middleware, /function requestHostname/);
  assert.ok(
    hostResolver.indexOf("headersList.get('host')") < hostResolver.indexOf("headersList.get('x-forwarded-host')"),
    'the direct Host header must be resolved before X-Forwarded-Host',
  );
});

test('OAuth callback stays on the host that received the authorization code', () => {
  assert.match(middleware, /startsWithPath\(pathname, MAILBOX_PREFIXES\) && pathname !== '\/auth\/callback'/);
  assert.match(callbackRoute, /if \(!origin\) return secureRedirect/);
  assert.match(callbackRoute, /response\.headers\.set\('cache-control', 'no-store'\)/);
  assert.match(callbackRoute, /response\.headers\.set\('referrer-policy', 'no-referrer'\)/);
});

test('domain OAuth callback stays on the initiating control host', () => {
  assert.match(middleware, /pathname !== ['"]\/auth\/callback['"]/);
  assert.match(callbackRoute, /hostname === MAIL_HOST \|\| hostname === DOMAIN_CONTROL_HOST/);
  assert.match(callbackRoute, /return `https:\/\/\$\{hostname\}`/);
  assert.doesNotMatch(callbackRoute, /new URL\(next, requestUrl\.origin\)/);
});
