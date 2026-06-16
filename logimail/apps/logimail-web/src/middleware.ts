import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const MAIL_HOST = 'mail.logivn.com';
const DOMAIN_CONTROL_HOST = 'domain.logivn.com';

const domainControlPrefixes = ['/domains', '/mailboxes', '/ops', '/settings', '/team', '/onboarding'];

function startsWithPath(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function requestHostname(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  return (forwardedHost?.split(',')[0]?.trim().split(':')[0] || request.nextUrl.hostname).toLowerCase();
}

function redirectToHost(request: NextRequest, hostname: string, pathname: string) {
  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.hostname = hostname;
  url.port = '';
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

function authErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function authErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}

function isStaleRefreshTokenError(error: unknown) {
  const code = authErrorCode(error);
  const message = authErrorMessage(error).toLowerCase();
  return code === 'refresh_token_already_used' || code === 'refresh_token_not_found' || message.includes('invalid refresh token');
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')) {
      response.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
    }
  }
}

export async function middleware(request: NextRequest) {
  const hostname = requestHostname(request);
  const pathname = request.nextUrl.pathname;

  if (hostname === MAIL_HOST) {
    if (pathname === '/' || pathname === '/dashboard') {
      const url = request.nextUrl.clone();
      url.pathname = '/mail/inbox';
      return NextResponse.redirect(url);
    }

    if (startsWithPath(pathname, domainControlPrefixes) || pathname.startsWith('/dashboard/')) {
      return redirectToHost(request, DOMAIN_CONTROL_HOST, pathname);
    }
  }

  if (hostname === DOMAIN_CONTROL_HOST) {
    // domain.logivn.com '/' renders the management console directly (see app/page.tsx).
    if (pathname === '/mail' || pathname.startsWith('/mail/')) {
      return redirectToHost(request, MAIL_HOST, pathname);
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    db: { schema: 'logimail' },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  try {
    const { error } = await supabase.auth.getUser();
    if (isStaleRefreshTokenError(error)) clearSupabaseAuthCookies(request, response);
  } catch (error) {
    if (isStaleRefreshTokenError(error)) {
      clearSupabaseAuthCookies(request, response);
    } else {
      console.warn('[logimail-middleware] Supabase auth check failed', authErrorMessage(error));
    }
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
