import { NextResponse, type NextRequest } from 'next/server';
import { DOMAIN_CONTROL_HOST, DOMAIN_CONTROL_PREFIXES, MAIL_HOST, MAILBOX_PREFIXES, startsWithPath } from '@/lib/logimail-hosts';

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

    if (startsWithPath(pathname, DOMAIN_CONTROL_PREFIXES) || pathname.startsWith('/dashboard/')) {
      return redirectToHost(request, DOMAIN_CONTROL_HOST, pathname);
    }
  }

  if (hostname === DOMAIN_CONTROL_HOST) {
    // domain.logivn.com '/' renders the management console directly (see app/page.tsx).
    if (startsWithPath(pathname, MAILBOX_PREFIXES)) {
      return redirectToHost(request, MAIL_HOST, pathname);
    }
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
