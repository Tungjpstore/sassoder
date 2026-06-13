import 'server-only';

import { resolve4, resolveMx, resolveTxt, reverse } from 'node:dns/promises';
import {
  buildSafeDnsPlan,
  createLogimailServiceStore,
  normalizeDomain,
  normalizeSlug,
  supabaseErrorMessage,
} from '@/lib/logimail-store';

export type ApprovalRequestType = 'account' | 'domain' | 'mailbox';
export type DnsState = 'pass' | 'warning' | 'fail' | 'unknown';

export type ApprovalRequestView = {
  id: string;
  type: ApprovalRequestType;
  status: string;
  title: string;
  detail: string;
  requesterUserId: string;
  requesterEmail: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  targetValue: string;
  riskFlags: string[];
  plannedRecordCount: number;
  createdAt: string;
};

export type AdminDnsRecord = { type: string; name: string; content: string; priority?: number; proxied?: boolean };

export type AdminDomainView = {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  domain: string;
  mailHostname: string | null;
  status: string;
  approvalStatus: string;
  registrationEnabled: boolean;
  dns: { mx: string; spf: string; dkim: string; dmarc: string; ptr: string; lastCheckedAt: string | null };
  mailboxCount: number;
  plannedRecords: AdminDnsRecord[];
};

export type ApprovalQueue = {
  generatedAt: string;
  summary: { pendingTotal: number; accounts: number; domains: number; mailboxes: number };
  requests: ApprovalRequestView[];
};

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('admin_service_not_configured');
  return client;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

// ---------------------------------------------------------------------------
// Approval queue
// ---------------------------------------------------------------------------

export async function getApprovalQueue(limit = 50): Promise<ApprovalQueue> {
  const db = store();
  const [accountsResult, domainsResult, mailboxesResult] = await Promise.all([
    db.from('account_requests').select('id,user_id,email,full_name,company_name,requested_workspace_name,requested_slug,status,created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(limit),
    db.from('domain_requests').select('id,workspace_id,requested_by,domain,mail_hostname,purpose,dns_plan,risk_flags,status,created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(limit),
    db.from('mailbox_requests').select('id,workspace_id,domain_id,requested_by,local_part,email_address,display_name,quota_mb,status,created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(limit),
  ]);

  for (const result of [accountsResult, domainsResult, mailboxesResult]) {
    if (result.error) throw new Error(supabaseErrorMessage(result.error));
  }

  const accounts = (accountsResult.data ?? []) as Array<Record<string, unknown>>;
  const domains = (domainsResult.data ?? []) as Array<Record<string, unknown>>;
  const mailboxes = (mailboxesResult.data ?? []) as Array<Record<string, unknown>>;

  const workspaceIds = uniqueStrings([...domains, ...mailboxes].map((row) => row.workspace_id as string));
  const requesterIds = uniqueStrings([
    ...accounts.map((row) => row.user_id as string),
    ...domains.map((row) => row.requested_by as string),
    ...mailboxes.map((row) => row.requested_by as string),
  ]);

  const [workspaceRows, profileRows] = await Promise.all([
    workspaceIds.length ? db.from('workspaces').select('id,name').in('id', workspaceIds) : Promise.resolve({ data: [], error: null }),
    requesterIds.length ? db.from('profiles').select('id,email').in('id', requesterIds) : Promise.resolve({ data: [], error: null }),
  ]);

  const workspaceById = new Map((((workspaceRows.data ?? []) as Array<{ id: string; name: string }>)).map((row) => [row.id, row.name]));
  const emailById = new Map((((profileRows.data ?? []) as Array<{ id: string; email: string }>)).map((row) => [row.id, row.email]));

  const requests: ApprovalRequestView[] = [
    ...accounts.map((row) => ({
      id: row.id as string,
      type: 'account' as const,
      status: row.status as string,
      title: (row.email as string) ?? 'Tài khoản mới',
      detail: `Workspace: ${(row.requested_workspace_name as string) ?? (row.company_name as string) ?? '—'}`,
      requesterUserId: row.user_id as string,
      requesterEmail: (row.email as string) ?? null,
      workspaceId: null,
      workspaceName: null,
      targetValue: (row.email as string) ?? '',
      riskFlags: [],
      plannedRecordCount: 0,
      createdAt: row.created_at as string,
    })),
    ...domains.map((row) => ({
      id: row.id as string,
      type: 'domain' as const,
      status: row.status as string,
      title: row.domain as string,
      detail: `Mail host: ${(row.mail_hostname as string) ?? `mail.${row.domain as string}`}`,
      requesterUserId: row.requested_by as string,
      requesterEmail: emailById.get(row.requested_by as string) ?? null,
      workspaceId: row.workspace_id as string,
      workspaceName: workspaceById.get(row.workspace_id as string) ?? null,
      targetValue: row.domain as string,
      riskFlags: Array.isArray(row.risk_flags) ? (row.risk_flags as string[]) : [],
      plannedRecordCount: Array.isArray(row.dns_plan) ? (row.dns_plan as unknown[]).length : 0,
      createdAt: row.created_at as string,
    })),
    ...mailboxes.map((row) => ({
      id: row.id as string,
      type: 'mailbox' as const,
      status: row.status as string,
      title: row.email_address as string,
      detail: `Quota: ${(row.quota_mb as number) ?? 0}MB`,
      requesterUserId: row.requested_by as string,
      requesterEmail: emailById.get(row.requested_by as string) ?? null,
      workspaceId: row.workspace_id as string,
      workspaceName: workspaceById.get(row.workspace_id as string) ?? null,
      targetValue: row.email_address as string,
      riskFlags: [],
      plannedRecordCount: 0,
      createdAt: row.created_at as string,
    })),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  return {
    generatedAt: new Date().toISOString(),
    summary: { pendingTotal: requests.length, accounts: accounts.length, domains: domains.length, mailboxes: mailboxes.length },
    requests,
  };
}

// ---------------------------------------------------------------------------
// Approve / reject
// ---------------------------------------------------------------------------

const REQUEST_TABLE: Record<ApprovalRequestType, string> = {
  account: 'account_requests',
  domain: 'domain_requests',
  mailbox: 'mailbox_requests',
};

async function getPendingRequest(type: ApprovalRequestType, requestId: string) {
  const { data, error } = await store().from(REQUEST_TABLE[type]).select('*').eq('id', requestId).eq('status', 'pending').maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('request_not_pending');
  return data as Record<string, unknown>;
}

async function uniqueWorkspaceSlug(base: string) {
  const db = store();
  let slug = base;
  try {
    slug = normalizeSlug(base);
  } catch {
    slug = `ws-${Date.now().toString(36)}`;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const { data, error } = await db.from('workspaces').select('id').eq('slug', candidate).maybeSingle();
    if (error) throw new Error(supabaseErrorMessage(error));
    if (!data) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

export async function approveRequest(input: { type: ApprovalRequestType; requestId: string; actor: string }) {
  if (input.type === 'account') return approveAccount(input.requestId, input.actor);
  if (input.type === 'domain') return approveDomain(input.requestId, input.actor);
  return approveMailbox(input.requestId, input.actor);
}

export async function rejectRequest(input: { type: ApprovalRequestType; requestId: string; actor: string; reason?: string | null }) {
  const reason = input.reason?.trim() || 'Từ chối từ domain.logivn.com';
  const current = await getPendingRequest(input.type, input.requestId);
  const { data, error } = await store()
    .from(REQUEST_TABLE[input.type])
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
      metadata: { ...asRecord(current.metadata), reviewedByActor: input.actor, reviewedFrom: 'domain.logivn.com', rejectionReason: reason },
    })
    .eq('id', input.requestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('request_not_pending');
  return { requestId: input.requestId, requestType: input.type, status: 'rejected' as const };
}

async function approveAccount(requestId: string, actor: string) {
  const db = store();
  const request = await getPendingRequest('account', requestId);
  const email = String(request.email);
  const workspaceName = (request.requested_workspace_name as string) || (request.company_name as string) || `LogiMail ${email}`;
  const slugBase = (request.requested_slug as string) || email.split('@')[0] || 'workspace';
  const slug = await uniqueWorkspaceSlug(slugBase);
  const now = new Date().toISOString();

  const profileResult = await db.from('profiles').upsert(
    { id: request.user_id as string, email, full_name: (request.full_name as string) || email, role: 'owner', account_status: 'approved', updated_at: now },
    { onConflict: 'id' },
  );
  if (profileResult.error) throw new Error(supabaseErrorMessage(profileResult.error));

  const workspaceResult = await db
    .from('workspaces')
    .insert({ name: workspaceName, slug, owner_id: request.user_id as string, plan: 'internal', status: 'active' })
    .select('id,slug')
    .single();
  if (workspaceResult.error) throw new Error(supabaseErrorMessage(workspaceResult.error));
  const workspace = workspaceResult.data as { id: string; slug: string };

  const memberResult = await db.from('workspace_members').upsert({ workspace_id: workspace.id, user_id: request.user_id as string, role: 'owner' }, { onConflict: 'workspace_id,user_id' });
  if (memberResult.error) throw new Error(supabaseErrorMessage(memberResult.error));
  await db.from('quotas').upsert({ workspace_id: workspace.id }, { onConflict: 'workspace_id' });

  const finalize = await db
    .from('account_requests')
    .update({ status: 'approved', reviewed_at: now, metadata: { ...asRecord(request.metadata), reviewedByActor: actor, reviewedFrom: 'domain.logivn.com', provisionedWorkspaceId: workspace.id } })
    .eq('id', requestId);
  if (finalize.error) throw new Error(supabaseErrorMessage(finalize.error));

  return { requestId, requestType: 'account' as const, status: 'approved' as const, workspaceId: workspace.id, workspaceSlug: workspace.slug };
}

async function approveDomain(requestId: string, actor: string) {
  const db = store();
  const request = await getPendingRequest('domain', requestId);
  const now = new Date().toISOString();

  const domainResult = await db
    .from('domains')
    .upsert(
      {
        workspace_id: request.workspace_id as string,
        domain: request.domain as string,
        mail_hostname: request.mail_hostname as string,
        approval_status: 'approved',
        registration_enabled: true,
        status: 'active',
        updated_at: now,
      },
      { onConflict: 'workspace_id,domain' },
    )
    .select('id')
    .single();
  if (domainResult.error) throw new Error(supabaseErrorMessage(domainResult.error));
  const domain = domainResult.data as { id: string };

  const finalize = await db
    .from('domain_requests')
    .update({ status: 'approved', reviewed_at: now, provisioned_domain_id: domain.id, metadata: { ...asRecord(request.metadata), reviewedByActor: actor, reviewedFrom: 'domain.logivn.com' } })
    .eq('id', requestId);
  if (finalize.error) throw new Error(supabaseErrorMessage(finalize.error));

  return { requestId, requestType: 'domain' as const, status: 'approved' as const, domainId: domain.id };
}

async function approveMailbox(requestId: string, actor: string) {
  const db = store();
  const request = await getPendingRequest('mailbox', requestId);

  const { data: domain, error: domainError } = await db.from('domains').select('id,workspace_id,status,approval_status').eq('id', request.domain_id as string).maybeSingle();
  if (domainError) throw new Error(supabaseErrorMessage(domainError));
  if (!domain || domain.workspace_id !== request.workspace_id || domain.status !== 'active' || domain.approval_status !== 'approved') {
    throw new Error('domain_not_active');
  }
  const now = new Date().toISOString();

  const mailboxResult = await db
    .from('mailboxes')
    .upsert(
      {
        workspace_id: request.workspace_id as string,
        domain_id: request.domain_id as string,
        email_address: request.email_address as string,
        display_name: request.display_name as string | null,
        quota_mb: request.quota_mb as number,
        status: 'active',
        provider: 'billionmail',
        updated_at: now,
      },
      { onConflict: 'email_address' },
    )
    .select('id')
    .single();
  if (mailboxResult.error) throw new Error(supabaseErrorMessage(mailboxResult.error));
  const mailbox = mailboxResult.data as { id: string };

  await db.from('mailbox_permissions').upsert({ mailbox_id: mailbox.id, user_id: request.requested_by as string, permission: 'admin' }, { onConflict: 'mailbox_id,user_id' });

  const finalize = await db
    .from('mailbox_requests')
    .update({ status: 'approved', reviewed_at: now, provisioned_mailbox_id: mailbox.id, metadata: { ...asRecord(request.metadata), reviewedByActor: actor, reviewedFrom: 'domain.logivn.com' } })
    .eq('id', requestId);
  if (finalize.error) throw new Error(supabaseErrorMessage(finalize.error));

  return { requestId, requestType: 'mailbox' as const, status: 'approved' as const, mailboxId: mailbox.id };
}

// ---------------------------------------------------------------------------
// Domain control
// ---------------------------------------------------------------------------

type DomainRow = {
  id: string;
  workspace_id: string;
  domain: string;
  mail_hostname: string | null;
  status: string;
  approval_status: string;
  registration_enabled: boolean;
  spf_status?: string;
  dkim_status?: string;
  dmarc_status?: string;
  mx_status?: string;
  ptr_status?: string;
  last_checked_at?: string | null;
};

const DOMAIN_COLUMNS = 'id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at';

function plannedRecordsFor(domain: DomainRow): AdminDnsRecord[] {
  const vpsIp = process.env.LOGIMAIL_VPS_IP ?? '';
  const mailHostname = domain.mail_hostname ?? process.env.LOGIMAIL_MAIL_HOSTNAME ?? `mail.${domain.domain}`;
  if (!vpsIp) return [];
  return buildSafeDnsPlan(domain.domain, vpsIp, mailHostname).map((record) => ({ ...record }));
}

function mapDomain(row: DomainRow, workspaceName: string | null, mailboxCount: number): AdminDomainView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName,
    domain: row.domain,
    mailHostname: row.mail_hostname,
    status: row.status,
    approvalStatus: row.approval_status,
    registrationEnabled: row.registration_enabled,
    dns: {
      mx: row.mx_status ?? 'unknown',
      spf: row.spf_status ?? 'unknown',
      dkim: row.dkim_status ?? 'unknown',
      dmarc: row.dmarc_status ?? 'unknown',
      ptr: row.ptr_status ?? 'unknown',
      lastCheckedAt: row.last_checked_at ?? null,
    },
    mailboxCount,
    plannedRecords: plannedRecordsFor(row),
  };
}

export async function getDomainControl() {
  const db = store();
  const [domainsResult, workspacesResult] = await Promise.all([
    db.from('domains').select(DOMAIN_COLUMNS).order('domain', { ascending: true }),
    db.from('workspaces').select('id,name,slug,status').order('created_at', { ascending: true }),
  ]);
  if (domainsResult.error) throw new Error(supabaseErrorMessage(domainsResult.error));
  if (workspacesResult.error) throw new Error(supabaseErrorMessage(workspacesResult.error));

  const domains = (domainsResult.data ?? []) as DomainRow[];
  const workspaces = (workspacesResult.data ?? []) as Array<{ id: string; name: string; slug: string; status: string }>;
  const workspaceById = new Map(workspaces.map((row) => [row.id, row.name]));

  const counts = new Map<string, number>();
  if (domains.length) {
    const { data: mailboxRows } = await db.from('mailboxes').select('domain_id').in('domain_id', domains.map((row) => row.id));
    for (const row of ((mailboxRows ?? []) as Array<{ domain_id: string }>)) {
      counts.set(row.domain_id, (counts.get(row.domain_id) ?? 0) + 1);
    }
  }

  const mapped = domains.map((row) => mapDomain(row, workspaceById.get(row.workspace_id) ?? null, counts.get(row.id) ?? 0));
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: mapped.length,
      active: mapped.filter((domain) => domain.status === 'active' && domain.approvalStatus === 'approved').length,
      registrationEnabled: mapped.filter((domain) => domain.registrationEnabled).length,
      warning: mapped.filter((domain) => [domain.dns.mx, domain.dns.spf, domain.dns.dkim, domain.dns.dmarc, domain.dns.ptr].some((status) => ['warning', 'fail', 'unknown'].includes(status))).length,
      cloudflareReady: Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID),
    },
    workspaces,
    domains: mapped,
  };
}

async function getDomain(domainId: string) {
  const { data, error } = await store().from('domains').select(DOMAIN_COLUMNS).eq('id', domainId).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data as DomainRow | null) ?? null;
}

export async function setDomainRegistration(input: { domainId: string; enabled: boolean; actor: string }) {
  const current = await getDomain(input.domainId);
  if (!current) throw new Error('domain_not_found');
  const { data, error } = await store()
    .from('domains')
    .update({ registration_enabled: input.enabled, status: input.enabled ? 'active' : current.status, updated_at: new Date().toISOString() })
    .eq('id', current.id)
    .select(DOMAIN_COLUMNS)
    .single();
  if (error) throw new Error(supabaseErrorMessage(error));
  return data as DomainRow;
}

export async function updateDomain(input: { domainId: string; mailHostname?: string | null; status?: string | null; registrationEnabled?: boolean; actor: string }) {
  const current = await getDomain(input.domainId);
  if (!current) throw new Error('domain_not_found');
  const validStatus = new Set(['pending', 'active', 'warning', 'failed', 'disabled']);
  const status = input.status && validStatus.has(input.status) ? input.status : current.status;
  const mailHostname = input.mailHostname ? normalizeDomain(input.mailHostname) : current.mail_hostname;
  const { data, error } = await store()
    .from('domains')
    .update({ mail_hostname: mailHostname, status, registration_enabled: input.registrationEnabled ?? current.registration_enabled, updated_at: new Date().toISOString() })
    .eq('id', current.id)
    .select(DOMAIN_COLUMNS)
    .single();
  if (error) throw new Error(supabaseErrorMessage(error));
  return data as DomainRow;
}

export async function removeDomain(input: { domainId: string; actor: string }) {
  const db = store();
  const current = await getDomain(input.domainId);
  if (!current) throw new Error('domain_not_found');
  const { count } = await db.from('mailboxes').select('id', { count: 'exact', head: true }).eq('domain_id', current.id);
  if ((count ?? 0) > 0) {
    const { data, error } = await db
      .from('domains')
      .update({ status: 'disabled', registration_enabled: false, updated_at: new Date().toISOString() })
      .eq('id', current.id)
      .select('id,domain,status')
      .single();
    if (error) throw new Error(supabaseErrorMessage(error));
    return { mode: 'disabled' as const, domain: data };
  }
  const { error } = await db.from('domains').delete().eq('id', current.id);
  if (error) throw new Error(supabaseErrorMessage(error));
  return { mode: 'deleted' as const, domain: { id: current.id, domain: current.domain } };
}

async function resolveDomainDnsStatus(domain: string, mailHostname: string): Promise<{ mx: DnsState; spf: DnsState; dkim: DnsState; dmarc: DnsState; ptr: DnsState }> {
  const vpsIp = process.env.LOGIMAIL_VPS_IP ?? '';

  const mx = await resolveMx(domain).then((records) => (records.some((record) => record.exchange.toLowerCase() === mailHostname.toLowerCase()) ? 'pass' : records.length ? 'warning' : 'fail')).catch(() => 'fail' as DnsState);
  const spf = await resolveTxt(domain).then((records) => (records.flat().some((value) => value.toLowerCase().startsWith('v=spf1')) ? 'pass' : 'fail')).catch(() => 'fail' as DnsState);
  const dmarc = await resolveTxt(`_dmarc.${domain}`).then((records) => (records.flat().some((value) => value.toLowerCase().startsWith('v=dmarc1')) ? 'pass' : 'fail')).catch(() => 'fail' as DnsState);
  const dkim = await resolveTxt(`default._domainkey.${domain}`).then((records) => (records.flat().some((value) => value.toLowerCase().includes('v=dkim1')) ? 'pass' : 'warning')).catch(() => 'warning' as DnsState);
  const ptr = vpsIp
    ? await reverse(vpsIp).then((names) => (names.some((name) => name.toLowerCase() === mailHostname.toLowerCase()) ? 'pass' : 'warning')).catch(() => 'warning' as DnsState)
    : ('unknown' as DnsState);

  return { mx, spf, dkim, dmarc, ptr };
}

export async function checkDomainDns(input: { domainId: string; actor: string }) {
  const current = await getDomain(input.domainId);
  if (!current) throw new Error('domain_not_found');
  const mailHostname = current.mail_hostname || process.env.LOGIMAIL_MAIL_HOSTNAME || `mail.${current.domain}`;
  const status = await resolveDomainDnsStatus(current.domain, mailHostname);
  const { data, error } = await store()
    .from('domains')
    .update({
      mx_status: status.mx,
      spf_status: status.spf,
      dkim_status: status.dkim,
      dmarc_status: status.dmarc,
      ptr_status: status.ptr,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id)
    .select(DOMAIN_COLUMNS)
    .single();
  if (error) throw new Error(supabaseErrorMessage(error));
  return data as DomainRow;
}

export function adminServiceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'admin_error');
  if (message === 'admin_service_not_configured') return { status: 503, text: 'Thiếu service role cho bảng điều khiển admin.' };
  if (message === 'request_not_pending') return { status: 409, text: 'Yêu cầu không còn ở trạng thái chờ duyệt.' };
  if (message === 'domain_not_found') return { status: 404, text: 'Không tìm thấy domain.' };
  if (message === 'domain_not_active') return { status: 409, text: 'Domain của mailbox chưa được duyệt hoặc không còn active.' };
  return { status: 502, text: message };
}
