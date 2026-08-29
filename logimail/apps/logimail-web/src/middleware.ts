import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  DOMAIN_CONTROL_HOST,
  DOMAIN_CONTROL_PREFIXES,
  MAIL_HOST,
  MAILBOX_PREFIXES,
  hostnameFromHeaders,
  startsWithPath,
} from '@/lib/logimail-hosts';
import { safeSsoNextPath, type SsoSurface } from '@/lib/sso-handoff';

export const runtime = 'nodejs';

function redirectToHost(request: NextRequest, hostname: string, pathname: string) {
  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.hostname = hostname;
  url.port = '';
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

type RefreshedCookie = { name: string; value: string; options: CookieOptions };

function applyRefreshedCookies(response: NextResponse, cookies: RefreshedCookie[]) {
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

function ssoRedirect(request: NextRequest, targetHost: string, source: SsoSurface, target: SsoSurface) {
  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.hostname = targetHost;
  url.port = '';
  url.pathname = '/api/logimail/auth/sso/init';
  url.search = new URLSearchParams({
    source,
    next: safeSsoNextPath(target, `${request.nextUrl.pathname}${request.nextUrl.search}`),
  }).toString();
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const hostname = hostnameFromHeaders(request.headers, request.nextUrl.hostname);
  const pathname = request.nextUrl.pathname;
  let crossHostTarget: { hostname: string; source: SsoSurface; target: SsoSurface } | null = null;

  if (hostname === MAIL_HOST) {
    if (pathname === '/' || pathname === '/dashboard') {
      const url = request.nextUrl.clone();
      url.pathname = '/mail/inbox';
      return NextResponse.redirect(url);
    }

    if (startsWithPath(pathname, DOMAIN_CONTROL_PREFIXES) || pathname.startsWith('/dashboard/')) {
      crossHostTarget = { hostname: DOMAIN_CONTROL_HOST, source: 'mail', target: 'domain' };
    }
  }

  if (hostname === DOMAIN_CONTROL_HOST) {
    // domain.logivn.com '/' renders the management console directly (see app/page.tsx).
    // Keep the OAuth callback on the initiating host so Supabase can exchange
    // the code before any cross-host mailbox routing runs.
    if (startsWithPath(pathname, MAILBOX_PREFIXES) && pathname !== '/auth/callback') {
      crossHostTarget = { hostname: MAIL_HOST, source: 'domain', target: 'mail' };
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return crossHostTarget
      ? redirectToHost(request, crossHostTarget.hostname, pathname)
      : NextResponse.next({ request });
  }

  // Persist refreshed tokens here because Server Components cannot reliably
  // write their Set-Cookie updates back to the browser.
  const refreshedCookies: RefreshedCookie[] = [];
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    db: { schema: 'logimail' },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        refreshedCookies.splice(0, refreshedCookies.length, ...cookiesToSet);
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && Boolean(data?.claims?.sub);
  } catch {
    // Page and API auth boundaries handle unauthenticated requests explicitly.
  }

  if (crossHostTarget) {
    const redirect = authenticated
      ? ssoRedirect(request, crossHostTarget.hostname, crossHostTarget.source, crossHostTarget.target)
      : redirectToHost(request, crossHostTarget.hostname, pathname);
    return applyRefreshedCookies(redirect, refreshedCookies);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
