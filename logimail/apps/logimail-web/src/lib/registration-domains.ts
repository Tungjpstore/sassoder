import 'server-only';

import { createLogimailServiceStore, normalizeDomain } from '@/lib/logimail-store';

export type RegistrationDomainOption = {
  id?: string;
  workspaceId?: string;
  domain: string;
  label: string;
  source: 'supabase' | 'env';
};

type DomainRegistrationRow = {
  id: string;
  workspace_id: string;
  domain: string;
  mail_hostname: string | null;
  status: string;
  approval_status: string;
  registration_enabled: boolean;
};

export type RegistrationDomainRecord = DomainRegistrationRow & {
  source: 'supabase';
};

function fallbackDomain() {
  const configured = process.env.LOGIMAIL_DOMAIN ?? process.env.NEXT_PUBLIC_LOGIMAIL_DOMAIN ?? 'logivn.com';
  try {
    return normalizeDomain(configured);
  } catch {
    return null;
  }
}

export async function getRegistrationDomains(): Promise<RegistrationDomainOption[]> {
  const store = createLogimailServiceStore();

  if (store) {
    const { data, error } = await store
      .from('domains')
      .select('id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled')
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .eq('registration_enabled', true)
      .order('domain');

    if (!error && data && data.length > 0) {
      return (data as DomainRegistrationRow[]).map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        domain: row.domain,
        label: row.domain,
        source: 'supabase' as const,
      }));
    }
  }

  const domain = fallbackDomain();
  return domain ? [{ domain, label: domain, source: 'env' }] : [];
}

export async function isAllowedRegistrationDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  const domains = await getRegistrationDomains();
  return domains.some((item) => item.domain === normalized) ? normalized : null;
}

export async function getRegistrationDomainRecord(domain: string): Promise<RegistrationDomainRecord | null> {
  const normalized = normalizeDomain(domain);
  const store = createLogimailServiceStore();
  if (!store) return null;

  const { data, error } = await store
    .from('domains')
    .select('id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled')
    .eq('domain', normalized)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .eq('registration_enabled', true)
    .maybeSingle();

  if (error || !data) return null;
  return { ...(data as DomainRegistrationRow), source: 'supabase' };
}
