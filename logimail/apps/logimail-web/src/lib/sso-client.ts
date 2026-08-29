'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DOMAIN_CONTROL_HOST, MAIL_HOST, isLocalHost } from '@/lib/logimail-hosts';
import { safeNextPath } from '@/lib/safe-next-path';
import type { SsoSurface } from '@/lib/sso-handoff';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code?: string; message?: string } };

function targetOrigin(surface: SsoSurface) {
  if (isLocalHost(window.location.hostname)) return window.location.origin;
  return `https://${surface === 'mail' ? MAIL_HOST : DOMAIN_CONTROL_HOST}`;
}

async function readEnvelope<T>(response: Response) {
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !body || body.ok !== true) {
    const error = body && 'error' in body ? body.error : null;
    throw new Error(error?.message ?? 'Không thể hoàn tất chuyển phiên đăng nhập.');
  }
  return body.data;
}

export async function startSsoTransfer(
  target: SsoSurface,
  nextPath: string,
  state: string,
  codeChallenge: string,
) {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Phiên đăng nhập hiện tại đã hết hạn.');

  const response = await fetch('/api/logimail/auth/sso/start', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      target,
      next: safeNextPath(nextPath),
      state,
      codeChallenge,
    }),
  });
  const result = await readEnvelope<{ redirectUrl: string }>(response);
  const destination = new URL(result.redirectUrl);
  if (destination.origin !== targetOrigin(target) || destination.pathname !== '/sso/complete') {
    throw new Error('Đích chuyển phiên không hợp lệ.');
  }
  if (destination.hash) throw new Error('Đích chuyển phiên không hợp lệ.');
  window.location.replace(destination.toString());
}

export async function consumeSsoTransfer(ticket: string) {
  const response = await fetch('/api/logimail/auth/sso/consume', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });
  const result = await readEnvelope<{ next: string }>(response);
  return { next: safeNextPath(result.next) };
}

export async function logoutCurrentOrigin() {
  const tasks: Promise<unknown>[] = [
    fetch('/api/logimail/mail/session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }),
  ];
  let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null;

  try {
    supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      tasks.push(fetch('/api/logimail/auth/sso/revoke', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { authorization: `Bearer ${data.session.access_token}` },
      }));
    }
  } catch {
    // Cookie cleanup must still run when the browser auth client is unavailable.
  }

  await Promise.allSettled(tasks);
  if (supabase) await Promise.allSettled([supabase.auth.signOut()]);
}

export function nextGlobalLogoutUrl() {
  if (typeof window === 'undefined') return '/sso/logout';
  return isLocalHost(window.location.hostname) ? '/auth/login?logout=complete' : '/sso/logout';
}

export function nextLogoutPageUrl(relayFrom?: string | null) {
  const hostname = window.location.hostname.toLowerCase();
  if (isLocalHost(hostname)) return '/auth/login?logout=complete';

  const currentSurface = hostname === MAIL_HOST ? 'mail' : hostname === DOMAIN_CONTROL_HOST ? 'domain' : null;
  if (!currentSurface) return '/auth/login?logout=complete';

  const validRelay = (currentSurface === 'mail' && relayFrom === 'domain')
    || (currentSurface === 'domain' && relayFrom === 'mail');
  if (validRelay) return `https://${MAIL_HOST}/auth/login?logout=complete`;

  const peerHost = currentSurface === 'mail' ? DOMAIN_CONTROL_HOST : MAIL_HOST;
  return `https://${peerHost}/sso/logout?relay=${currentSurface}`;
}

export function ssoFallbackUrl(target: SsoSurface, nextPath: string) {
  const origin = targetOrigin(target);
  if (target === 'domain' && !isLocalHost(window.location.hostname)) return `${origin}/`;
  return `${origin}/auth/login?next=${encodeURIComponent(safeNextPath(nextPath))}`;
}
