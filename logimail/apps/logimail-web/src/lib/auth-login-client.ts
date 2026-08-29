'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { safeNextPath } from '@/lib/safe-next-path';

type LoginPayload = {
  email?: string;
  localPart?: string;
  domain?: string;
  password: string;
};

type LoginResponse = {
  email: string;
  accessToken: string;
};

type LoginApiResponse = LoginResponse & {
  refreshToken: string;
};

type SupabaseSessionAuth = Pick<ReturnType<typeof getSupabaseBrowserClient>['auth'], 'setSession'>;

type ApiErrorBody = {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
  };
};

type ApiSuccessBody<T> = {
  ok: true;
  data: T;
};

export class AuthClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfter?: number;

  constructor(message: string, details: Readonly<{ status: number; code?: string; retryAfter?: number }>) {
    super(message);
    this.name = 'AuthClientError';
    this.status = details.status;
    this.code = details.code;
    this.retryAfter = details.retryAfter;
  }
}

const COOLDOWN_PREFIX = 'logimail:auth-login-cooldown:';

function loginKey(email: string) {
  return `${COOLDOWN_PREFIX}${email.trim().toLowerCase()}`;
}

export function readLoginCooldownSeconds(email: string) {
  if (typeof window === 'undefined') return 0;
  let retryAt = 0;
  try {
    retryAt = Number(window.localStorage.getItem(loginKey(email)) ?? 0);
  } catch {
    return 0;
  }
  if (!Number.isFinite(retryAt) || retryAt <= Date.now()) return 0;
  return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
}

export function storeLoginCooldown(email: string, retryAfterSeconds: number) {
  if (typeof window === 'undefined' || retryAfterSeconds <= 0) return;
  try {
    window.localStorage.setItem(loginKey(email), String(Date.now() + retryAfterSeconds * 1000));
  } catch {
    // Private browsing and storage quotas must not block authentication.
  }
}

export function clearLoginCooldown(email: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(loginKey(email));
  } catch {
    // Ignore storage failures; the server remains the source of truth.
  }
}

function retryAfterSeconds(response: Response) {
  const raw = Number(response.headers.get('Retry-After') ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

export async function logimailAuthRequest<T>(path: string, payload: unknown, headers?: HeadersInit): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null) as ApiErrorBody | ApiSuccessBody<T> | null;
  if (!response.ok || !body || body.ok !== true || !('data' in body)) {
    const errorBody = body && 'error' in body ? body.error : undefined;
    throw new AuthClientError(errorBody?.message ?? 'Dịch vụ xác thực chưa phản hồi đúng định dạng.', {
      status: response.status,
      code: errorBody?.code,
      retryAfter: retryAfterSeconds(response),
    });
  }
  return body.data;
}

export async function logimailPasswordLogin(
  payload: LoginPayload,
  auth?: SupabaseSessionAuth,
): Promise<LoginResponse> {
  const data = await logimailAuthRequest<LoginApiResponse>('/api/logimail/auth/login', payload);
  if (!data.accessToken || !data.refreshToken) {
    throw new AuthClientError('Đăng nhập thành công nhưng thiếu phiên Supabase.', { status: 502, code: 'missing_auth_session' });
  }

  try {
    // Resolve the browser client after the API response has replaced stale
    // auth cookies; constructing it earlier can refresh the old token.
    const sessionAuth = auth ?? getSupabaseBrowserClient().auth;
    const { error } = await sessionAuth.setSession({
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
    });
    if (error) throw error;
  } catch {
    throw new AuthClientError('Không thể lưu phiên đăng nhập trên trình duyệt.', { status: 502, code: 'browser_session_failed' });
  }

  return { email: data.email, accessToken: data.accessToken };
}

/** Start the configured Google provider without exposing a shared auth cookie. */
export async function logimailGoogleLogin(nextPath: string) {
  const next = safeNextPath(nextPath, { disallowAuthRoutes: true });
  const callback = new URL('/auth/callback', window.location.origin);
  callback.searchParams.set('next', next);
  const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callback.toString(), skipBrowserRedirect: false },
  });
  if (error) throw new AuthClientError('Không thể mở đăng nhập Google.', { status: 502, code: 'google_oauth_failed' });
}
