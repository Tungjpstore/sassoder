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

export type AuthenticationDomainOptions = {
  domains: RegistrationDomainOption[];
  status: 'ready' | 'unavailable';
};

function fallbackDomain() {
  const configured = process.env.LOGIMAIL_DOMAIN ?? process.env.NEXT_PUBLIC_LOGIMAIL_DOMAIN ?? 'logivn.com';
  try {
    return normalizeDomain(configured);
  } catch {
    return null;
  }
}

function domainOption(row: DomainRegistrationRow): RegistrationDomainOption {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    domain: row.domain,
    label: row.domain,
    source: 'supabase',
  };
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

    // Once Supabase is configured it is authoritative. Falling back to an env
    // domain on an empty/error result could silently reopen disabled sign-ups.
    if (error) return [];
    return (data as DomainRegistrationRow[] | null ?? []).map(domainOption);
  }

  const domain = fallbackDomain();
  return domain ? [{ domain, label: domain, source: 'env' }] : [];
}

export async function getAuthenticationDomainOptions(): Promise<AuthenticationDomainOptions> {
  const store = createLogimailServiceStore();

  if (store) {
    const { data, error } = await store
      .from('domains')
      .select('id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled')
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .order('domain');

    if (error) return { domains: [], status: 'unavailable' };
    return { domains: (data as DomainRegistrationRow[] | null ?? []).map(domainOption), status: 'ready' };
  }

  const domain = fallbackDomain();
  return { domains: domain ? [{ domain, label: domain, source: 'env' }] : [], status: 'ready' };
}

export async function getAuthenticationDomains(): Promise<RegistrationDomainOption[]> {
  return (await getAuthenticationDomainOptions()).domains;
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

export async function getAuthenticationDomainRecord(domain: string): Promise<RegistrationDomainRecord | null> {
  const normalized = normalizeDomain(domain);
  const store = createLogimailServiceStore();
  if (!store) return null;

  const { data, error } = await store
    .from('domains')
    .select('id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled')
    .eq('domain', normalized)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .maybeSingle();

  if (error || !data) return null;
  return { ...(data as DomainRegistrationRow), source: 'supabase' };
}
