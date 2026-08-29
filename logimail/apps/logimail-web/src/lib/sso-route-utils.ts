import { NextResponse } from 'next/server';

import { hostnameFromHeaders, isLocalHost, MAIL_HOST, DOMAIN_CONTROL_HOST } from '@/lib/logimail-hosts';
import { ssoStateCookieName } from '@/lib/sso-handoff';

export function requestHostname(request: Request) {
  const url = new URL(request.url);
  return hostnameFromHeaders(request.headers, url.hostname);
}

export function requestLocal(request: Request) {
  return isLocalHost(requestHostname(request));
}

export function isSupportedSsoHostname(hostname: string) {
  return hostname === MAIL_HOST || hostname === DOMAIN_CONTROL_HOST || isLocalHost(hostname);
}

export function secureSsoResponse<T extends NextResponse>(response: T) {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

export function ssoStateCookieOptions(local: boolean, expires?: Date) {
  return {
    httpOnly: true,
    secure: !local,
    sameSite: 'lax' as const,
    path: '/',
    ...(expires ? { expires } : {}),
  };
}

export function clearSsoStateCookie(response: NextResponse, local: boolean) {
  response.cookies.set(ssoStateCookieName(local), '', {
    ...ssoStateCookieOptions(local, new Date(0)),
    maxAge: 0,
  });
  return response;
}
