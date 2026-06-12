export const LOGIMAIL_DOMAIN_DEFAULT = 'logivn.com';

export const mailTransportHosts = ['mail', 'smtp', 'imap'] as const;

export function isMailTransportHostname(hostname: string) {
  return mailTransportHosts.some((prefix) => hostname.startsWith(`${prefix}.`));
}
