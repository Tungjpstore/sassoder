export const MAIL_HOST = 'mail.logivn.com';
export const DOMAIN_CONTROL_HOST = 'domain.logivn.com';

export const DOMAIN_CONTROL_PREFIXES = ['/domains', '/mailboxes', '/ops', '/settings', '/team', '/onboarding'];
export const MAILBOX_PREFIXES = ['/mail', '/login', '/register', '/auth'];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function startsWithPath(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function hostnameFromAuthority(value: string | null | undefined) {
  const authority = value?.split(',')[0]?.trim();
  if (!authority) return '';
  try {
    const parsed = new URL(`http://${authority}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
    return parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return '';
  }
}

export function hostnameFromHeaders(headersList: Headers, fallback = '') {
  const host = headersList.get('host');
  if (host !== null) return hostnameFromAuthority(host);

  const forwardedHost = headersList.get('x-forwarded-host');
  if (forwardedHost !== null) return hostnameFromAuthority(forwardedHost);

  return hostnameFromAuthority(fallback);
}

export function isLocalHost(hostname: string) {
  return LOCAL_HOSTS.has(hostname);
}

export function isDomainConsoleHost(hostname: string) {
  return hostname === DOMAIN_CONTROL_HOST || isLocalHost(hostname);
}
