import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api-boundary';
import { normalizeAuthError } from '@/lib/auth-errors';
import { normalizeDomain, normalizeEmail, normalizeMailboxLocalPart, readJsonObject, stringField } from '@/lib/logimail-store';
import { enforceRateLimit } from '@/lib/rate-limit';

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

function hashForLog(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function firstClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function serverSupabaseAuthKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_DEFAULT_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
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

function applyCookies(response: NextResponse, cookiesToSet: CookieToSet[]) {
  for (const cookie of cookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  response.headers.set('cache-control', 'no-store');
  return response;
}

export async function POST(request: Request) {
  const ipLimited = enforceRateLimit(request, 'auth-login-ip', AUTH_LOGIN_IP_LIMIT, AUTH_LOGIN_WINDOW_MS);
  if (ipLimited) return ipLimited;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = serverSupabaseAuthKey();
  if (!url || !key) {
    return jsonError(
      'not_configured',
      'LogiMail chưa có Supabase URL/key cho đăng nhập server-side.',
      503,
    );
  }

  let email = '';
  let emailHash = 'unknown';
  const ipHash = hashForLog(firstClientIp(request));
  const cookiesToSet: CookieToSet[] = [];

  try {
    const body = await readJsonObject(request);
    email = emailFromBody(body);
    emailHash = hashForLog(email);
    const password = stringField(body, 'password', { required: true, max: 256 }) ?? '';

    const emailLimited = enforceRateLimit(request, `auth-login-email:${emailHash}`, AUTH_LOGIN_EMAIL_LIMIT, AUTH_LOGIN_WINDOW_MS);
    if (emailLimited) return emailLimited;

    const supabase = createServerClient(url, key, {
      db: { schema: 'logimail' },
      global: {
        headers: {
          'sb-forwarded-for': firstClientIp(request),
        },
      },
      cookies: {
        getAll() {
          return [];
        },
        setAll(nextCookies) {
          cookiesToSet.push(...nextCookies);
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('missing_auth_session');

    console.info('[logimail-auth-login] success', { emailHash, ipHash });
    return applyCookies(jsonOk({ email: data.user?.email ?? email, accessToken: data.session.access_token }), cookiesToSet);
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
    return applyCookies(response, cookiesToSet);
  }
}
