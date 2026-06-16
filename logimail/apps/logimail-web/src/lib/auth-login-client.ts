'use client';

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

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

const COOLDOWN_PREFIX = 'logimail:auth-login-cooldown:';

function loginKey(email: string) {
  return `${COOLDOWN_PREFIX}${email.trim().toLowerCase()}`;
}

export function readLoginCooldownSeconds(email: string) {
  if (typeof window === 'undefined') return 0;
  const retryAt = Number(window.localStorage.getItem(loginKey(email)) ?? 0);
  if (!Number.isFinite(retryAt) || retryAt <= Date.now()) return 0;
  return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
}

export function storeLoginCooldown(email: string, retryAfterSeconds: number) {
  if (typeof window === 'undefined' || retryAfterSeconds <= 0) return;
  window.localStorage.setItem(loginKey(email), String(Date.now() + retryAfterSeconds * 1000));
}

export async function logimailPasswordLogin(payload: LoginPayload): Promise<LoginResponse> {
  const response = await fetch('/api/logimail/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({})) as ApiErrorBody | { data?: LoginResponse };

  if (!response.ok || !('data' in body) || !body.data) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? 0);
    throw {
      status: response.status,
      code: 'error' in body ? body.error?.code : undefined,
      message: 'error' in body ? body.error?.message : 'Không đăng nhập được.',
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    };
  }

  return body.data;
}
