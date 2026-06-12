export type DnsRecordPlan = {
  type: 'A' | 'MX' | 'TXT';
  name: string;
  content: string;
  proxied?: boolean;
  priority?: number;
};

export function buildSafeDnsPlan(domain: string, vpsIp: string): DnsRecordPlan[] {
  const mailHost = process.env.LOGIMAIL_MAIL_HOSTNAME ?? `mail.${domain}`;
  const smtpHost = process.env.LOGIMAIL_SMTP_HOSTNAME ?? mailHost;
  const imapHost = process.env.LOGIMAIL_IMAP_HOSTNAME ?? mailHost;
  const plan: DnsRecordPlan[] = [
    { type: 'A', name: mailHost, content: vpsIp, proxied: false },
    { type: 'MX', name: domain, content: mailHost, priority: 10 },
    { type: 'TXT', name: domain, content: `v=spf1 mx ip4:${vpsIp} -all` },
    { type: 'TXT', name: `_dmarc.${domain}`, content: `v=DMARC1; p=none; rua=mailto:postmaster@${domain}` },
  ];

  if (smtpHost !== mailHost) {
    plan.splice(1, 0, { type: 'A', name: smtpHost, content: vpsIp, proxied: false });
  }

  if (imapHost !== mailHost && imapHost !== smtpHost) {
    plan.splice(1, 0, { type: 'A', name: imapHost, content: vpsIp, proxied: false });
  }

  return plan;
}

export function assertCloudflareReady() {
  const missing = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID'].filter((key) => !process.env[key]);
  return { ready: missing.length === 0, missing };
}
