export const MAIL_HOST = 'mail.logivn.com';
export const DOMAIN_CONTROL_HOST = 'domain.logivn.com';

export const DOMAIN_CONTROL_PREFIXES = ['/domains', '/mailboxes', '/ops', '/settings', '/team', '/onboarding'];
export const MAILBOX_PREFIXES = ['/mail', '/login', '/register', '/auth'];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function startsWithPath(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function hostnameFromHeaders(headersList: Headers, fallback = '') {
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? fallback;
  return host.split(',')[0]?.trim().replace(/^\[/, '').replace(/\]$/, '').split(':')[0]?.toLowerCase() ?? '';
}

export function isLocalHost(hostname: string) {
  return LOCAL_HOSTS.has(hostname);
}

export function isDomainConsoleHost(hostname: string) {
  return hostname === DOMAIN_CONTROL_HOST || isLocalHost(hostname);
}
