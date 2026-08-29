import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { AuthClientError, logimailAuthRequest, logimailPasswordLogin } = await import('./auth-login-client.ts');

test('password login persists the returned session in the Supabase browser client', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    ok: true,
    data: {
      email: 'qa@logivn.com',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    },
  }));

  let persistedSession;
  const result = await logimailPasswordLogin(
    { email: 'qa@logivn.com', password: 'correct-password' },
    {
      async setSession(session) {
        persistedSession = session;
        return { data: { session: null, user: null }, error: null };
      },
    },
  );

  assert.deepEqual(persistedSession, {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
  });
  assert.deepEqual(result, { email: 'qa@logivn.com', accessToken: 'access-token' });
});

test('login route returns the refresh token required to restore the browser session', () => {
  const route = readFileSync(
    fileURLToPath(new URL('../app/api/logimail/auth/login/route.ts', import.meta.url)),
    'utf8',
  );
  assert.match(route, /refreshToken:\s*data\.session\.refresh_token/);
});

test('login route exposes incoming auth cookies so Supabase can delete stale session chunks', () => {
  const route = readFileSync(
    fileURLToPath(new URL('../app/api/logimail/auth/login/route.ts', import.meta.url)),
    'utf8',
  );

  assert.match(route, /export async function POST\(request: NextRequest\)/);
  assert.match(route, /getAll\(\)\s*{\s*return request\.cookies\.getAll\(\);\s*}/);
  assert.doesNotMatch(route, /getAll\(\)\s*{\s*return \[\];\s*}/);
  assert.match(route, /setAll\(nextCookies\)\s*{\s*cookiesToSet\.push\(\.\.\.nextCookies\);\s*}/);
});

test('login route expires legacy parent-domain auth cookies without setting new ones there', () => {
  const route = readFileSync(
    fileURLToPath(new URL('../app/api/logimail/auth/login/route.ts', import.meta.url)),
    'utf8',
  );
  const applyCookies = route.slice(route.indexOf('function applyCookies'), route.indexOf('function legacyAuthCookieNames'));

  assert.match(route, /AUTH_COOKIE_PARENT_DOMAIN\s*=\s*'logivn\.com'/);
  assert.match(route, /response\.headers\.append\([\s\S]*?'set-cookie'/);
  assert.match(route, /Max-Age=0; Domain=\$\{AUTH_COOKIE_PARENT_DOMAIN\}/);
  assert.match(route, /legacyAuthCookieNames\(request, url\)/);
  assert.match(route, /applyCookies\([\s\S]*?legacyCookieNames\)/);
  assert.doesNotMatch(route, /response\.cookies\.set\([\s\S]{0,160}AUTH_COOKIE_PARENT_DOMAIN/);
  assert.ok(applyCookies.indexOf('for (const name of legacyCookieNames)') < applyCookies.indexOf('for (const cookie of cookiesToSet)'));
  assert.match(applyCookies, /response\.headers\.delete\('set-cookie'\)/);
  assert.match(applyCookies, /serializeCookie\(cookie\)/);
});

test('legacy cleanup is scoped to the current Supabase project auth cookie and numeric chunks', () => {
  const route = readFileSync(
    fileURLToPath(new URL('../app/api/logimail/auth/login/route.ts', import.meta.url)),
    'utf8',
  );
  const cleanup = route.slice(route.indexOf('function legacyAuthCookieNames'), route.indexOf('export async function POST'));

  assert.match(cleanup, /new URL\(supabaseUrl\)\.hostname\.split\('\.'\)\[0\]/);
  assert.match(cleanup, /baseName = `sb-\$\{projectRef\}-auth-token`/);
  assert.match(cleanup, /cookie\.name\.startsWith\(`\$\{baseName\}\.`\)/);
  assert.match(cleanup, /\/\^\\d\+\$\//);
});

test('browser Supabase client is created only after the login response', () => {
  const client = readFileSync(
    fileURLToPath(new URL('./auth-login-client.ts', import.meta.url)),
    'utf8',
  );
  const login = client.slice(client.indexOf('export async function logimailPasswordLogin'));
  assert.match(login, /auth\?:\s*SupabaseSessionAuth/);
  assert.ok(login.indexOf('logimailAuthRequest<LoginApiResponse>') < login.indexOf('getSupabaseBrowserClient().auth'));
});

test('Google login uses the same callback and safe next-path boundary', () => {
  const client = readFileSync(
    fileURLToPath(new URL('./auth-login-client.ts', import.meta.url)),
    'utf8',
  );
  const google = client.slice(client.indexOf('export async function logimailGoogleLogin'));
  assert.match(google, /safeNextPath\(nextPath,\s*\{\s*disallowAuthRoutes:\s*true/);
  assert.match(google, /new URL\('\/auth\/callback', window\.location\.origin\)/);
  assert.match(google, /provider:\s*'google'/);
  assert.match(google, /signInWithOAuth/);
});

test('auth request returns typed data from the LogiMail envelope', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, data: { email: 'qa@logivn.com' } }));
  const result = await logimailAuthRequest('/api/logimail/auth/test', { test: true });
  assert.deepEqual(result, { email: 'qa@logivn.com' });
});

test('auth request preserves status, code and retry-after', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json(
    { ok: false, error: { code: 'rate_limited', message: 'Hãy thử lại sau.' } },
    { status: 429, headers: { 'Retry-After': '37' } },
  ));

  await assert.rejects(
    () => logimailAuthRequest('/api/logimail/auth/test', {}),
    (error) => error instanceof AuthClientError
      && error.status === 429
      && error.code === 'rate_limited'
      && error.retryAfter === 37,
  );
});

test('auth request hides malformed upstream responses behind a stable message', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('<html>proxy error</html>', { status: 502 }));
  await assert.rejects(
    () => logimailAuthRequest('/api/logimail/auth/test', {}),
    (error) => error instanceof AuthClientError
      && error.status === 502
      && /đúng định dạng/i.test(error.message),
  );
});
