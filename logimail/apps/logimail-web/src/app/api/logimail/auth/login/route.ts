import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api-boundary';
import { normalizeAuthError } from '@/lib/auth-errors';
import { trustedClientIp } from '@/lib/client-ip';
import { normalizeDomain, normalizeEmail, normalizeMailboxLocalPart, readJsonObject, stringField } from '@/lib/logimail-store';
import { enforceIdentityRateLimit, enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

const AUTH_LOGIN_WINDOW_MS = 60_000;
const AUTH_LOGIN_IP_LIMIT = 10;
const AUTH_LOGIN_EMAIL_LIMIT = 5;
const AUTH_COOKIE_PARENT_DOMAIN = 'logivn.com';

function hashForLog(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function readNumberProperty(error: unknown, key: string) {
  if (!error || typeof error !== 'object' || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringProperty(error: unknown, key: string) {
  if (!error || typeof error !== 'object' || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function statusForAuthError(error: unknown, retryAfterSeconds: number) {
  if (retryAfterSeconds > 0) return 429;
  const status = readNumberProperty(error, 'status');
  if (status && status >= 400 && status < 600) return status;
  const code = readStringProperty(error, 'code')?.toLowerCase() ?? '';
  if (code === 'invalid_credentials') return 401;
  return 400;
}

function emailFromBody(body: Record<string, unknown>) {
  const explicitEmail = stringField(body, 'email', { max: 254 });
  if (explicitEmail) return normalizeEmail(explicitEmail);

  const localPart = normalizeMailboxLocalPart(stringField(body, 'localPart', { required: true, max: 64 }) ?? '');
  const domain = normalizeDomain(stringField(body, 'domain', { required: true, max: 253 }) ?? '');
  return normalizeEmail(`${localPart}@${domain}`);
}

function serializeCookie(cookie: CookieToSet) {
  const scratchResponse = new NextResponse(null);
  scratchResponse.cookies.set(cookie.name, cookie.value, cookie.options);
  return scratchResponse.headers.get('set-cookie');
}

function applyCookies(response: NextResponse, cookiesToSet: CookieToSet[], legacyCookieNames: string[] = []) {
  response.headers.delete('set-cookie');
  for (const name of legacyCookieNames) {
    response.headers.append(
      'set-cookie',
      `${name}=; Path=/; Max-Age=0; Domain=${AUTH_COOKIE_PARENT_DOMAIN}; Secure; SameSite=Lax`,
    );
  }
  for (const cookie of cookiesToSet) {
    const serialized = serializeCookie(cookie);
    if (serialized) response.headers.append('set-cookie', serialized);
  }
  response.headers.set('cache-control', 'no-store');
  return response;
}

function legacyAuthCookieNames(request: NextRequest, supabaseUrl: string): string[] {
  let baseName = '';
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0] ?? '';
    if (projectRef) baseName = `sb-${projectRef}-auth-token`;
  } catch {
    return [];
  }
  if (!baseName) return [];

  const names = new Set<string>([baseName]);
  for (const cookie of request.cookies.getAll()) {
    const suffix = cookie.name.slice(baseName.length + 1);
    if (cookie.name === baseName || (cookie.name.startsWith(`${baseName}.`) && /^\d+$/.test(suffix))) {
      names.add(cookie.name);
    }
  }

  return [...names];
}

export async function POST(request: NextRequest) {
  const ipLimited = enforceRateLimit(request, 'auth-login-ip', AUTH_LOGIN_IP_LIMIT, AUTH_LOGIN_WINDOW_MS);
  if (ipLimited) return ipLimited;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  // User sign-in uses the public anon/publishable key. Privileged keys remain
  // reserved for admin-only server operations.
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) {
    return jsonError(
      'not_configured',
      'LogiMail chưa có Supabase URL/key cho đăng nhập server-side.',
      503,
    );
  }

  let email = '';
  let emailHash = 'unknown';
  const ip = trustedClientIp(request.headers);
  const ipHash = hashForLog(ip);
  const cookiesToSet: CookieToSet[] = [];
  const legacyCookieNames = legacyAuthCookieNames(request, url);

  try {
    const body = await readJsonObject(request);
    email = emailFromBody(body);
    emailHash = hashForLog(email);
    const password = stringField(body, 'password', { required: true, max: 256 }) ?? '';

    const emailLimited = enforceIdentityRateLimit('auth-login-email', emailHash, AUTH_LOGIN_EMAIL_LIMIT, AUTH_LOGIN_WINDOW_MS);
    if (emailLimited) return emailLimited;

    const supabase = createServerClient(url, key, {
      db: { schema: 'logimail' },
      global: {
        headers: {
          'sb-forwarded-for': ip,
        },
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(nextCookies) {
          cookiesToSet.push(...nextCookies);
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session?.access_token || !data.session.refresh_token) throw new Error('missing_auth_session');

    console.info('[logimail-auth-login] success', { emailHash, ipHash });
    return applyCookies(jsonOk({
      email: data.user?.email ?? email,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    }), cookiesToSet, legacyCookieNames);
  } catch (error) {
    const authError = normalizeAuthError(error, 'Không đăng nhập được.');
    const status = statusForAuthError(error, authError.retryAfterSeconds);
    const response = jsonError(status === 429 ? 'rate_limited' : 'login_failed', authError.message, status);
    if (authError.retryAfterSeconds > 0) response.headers.set('Retry-After', String(authError.retryAfterSeconds));
    console.warn('[logimail-auth-login] failed', {
      emailHash,
      ipHash,
      status,
      code: readStringProperty(error, 'code') ?? 'unknown',
    });
    return applyCookies(response, cookiesToSet, legacyCookieNames);
  }
}
