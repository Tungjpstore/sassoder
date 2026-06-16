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

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
