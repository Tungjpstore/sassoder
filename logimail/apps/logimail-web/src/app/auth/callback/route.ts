import { NextResponse } from 'next/server';
import { DOMAIN_CONTROL_HOST, hostnameFromHeaders, isLocalHost, MAIL_HOST } from '@/lib/logimail-hosts';
import { safeNextPath } from '@/lib/safe-next-path';
import { createLogimailServerClient } from '@/lib/supabase-server';

function callbackOrigin(request: Request, requestUrl: URL) {
  const hostname = hostnameFromHeaders(request.headers, requestUrl.hostname);
  if (isLocalHost(hostname)) return requestUrl.origin;
  if (hostname === MAIL_HOST || hostname === DOMAIN_CONTROL_HOST) return `https://${hostname}`;
  return null;
}

function secureRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = callbackOrigin(request, requestUrl);
  const code = requestUrl.searchParams.get('code');
  const providerError = requestUrl.searchParams.get('error');
  const next = safeNextPath(requestUrl.searchParams.get('next'), { disallowAuthRoutes: true });
  if (!origin) return secureRedirect(new URL('/auth/login?error=invalid_auth_host', `https://${MAIL_HOST}`));
  const supabase = await createLogimailServerClient();

  if (providerError) {
    return secureRedirect(new URL('/auth/login?error=access_denied', origin));
  }

  if (!supabase) {
    return secureRedirect(new URL('/auth/login?error=missing_supabase_config', origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return secureRedirect(new URL('/auth/login?error=auth_callback_failed', origin));
  }

  return secureRedirect(new URL(next, origin));
}
