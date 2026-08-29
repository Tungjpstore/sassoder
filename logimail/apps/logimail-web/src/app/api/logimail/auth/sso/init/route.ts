import { NextResponse } from 'next/server';

import { jsonError, requireServerConfig } from '@/lib/api-boundary';
import { createSsoBrowserState, normalizeSsoSurface, resolveSsoTarget, safeSsoNextPath, ssoStateCookieName, targetHostForSurface } from '@/lib/sso-handoff';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isSupportedSsoHostname, requestHostname, requestLocal, secureSsoResponse, ssoStateCookieOptions } from '@/lib/sso-route-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicInitError() {
  return secureSsoResponse(jsonError('sso_init_failed', 'Không thể bắt đầu chuyển phiên đăng nhập.', 400));
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, 'auth-sso-init', 30, 60_000);
  if (limited) return secureSsoResponse(limited);

  const requestUrl = new URL(request.url);
  const hostname = requestHostname(request);
  const local = requestLocal(request);
  if (!isSupportedSsoHostname(hostname)) return publicInitError();
  if (requireServerConfig(['LOGIMAIL_SSO_SECRET']).length > 0) {
    return secureSsoResponse(jsonError('not_configured', 'Dịch vụ chuyển phiên chưa được cấu hình đầy đủ.', 503));
  }

  try {
    const source = normalizeSsoSurface(requestUrl.searchParams.get('source') ?? '');
    const target = local
      ? normalizeSsoSurface(requestUrl.searchParams.get('target') ?? '')
      : source === 'mail'
        ? 'domain'
        : 'mail';

    if (source === target) throw new Error('invalid_sso_target');
    if (!local && targetHostForSurface(target) !== hostname) throw new Error('invalid_sso_host');

    const sourceHost = local ? hostname : targetHostForSurface(source);
    const resolved = resolveSsoTarget({ sourceHost, sourceOrigin: requestUrl.origin, target });
    if (resolved.targetHost !== hostname) throw new Error('invalid_sso_host');
    const next = safeSsoNextPath(target, requestUrl.searchParams.get('next'), local);
    const state = createSsoBrowserState({
      sourceHost,
      targetHost: resolved.targetHost,
      target,
      nextPath: next,
    });

    const sourceOrigin = local ? requestUrl.origin : `https://${sourceHost}`;
    const transferUrl = new URL('/sso/transfer', sourceOrigin);
    transferUrl.searchParams.set('target', target);
    transferUrl.searchParams.set('next', next);
    transferUrl.searchParams.set('state', state.state);
    transferUrl.searchParams.set('challenge', state.codeChallenge);

    const response = NextResponse.redirect(transferUrl);
    response.cookies.set(
      ssoStateCookieName(local),
      state.value,
      ssoStateCookieOptions(local, state.expiresAt),
    );
    return secureSsoResponse(response);
  } catch {
    return publicInitError();
  }
}
