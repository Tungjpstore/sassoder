import 'server-only';

import type { User } from '@supabase/supabase-js';
import { buildSafeDnsPlan } from '@/lib/logimail-store';
import type { ShellStatusItem, StatusTone } from '@/lib/logimail-types';
import { resolveMailboxPermission } from '@/lib/mail-permission';
import { enforceVerifiedSessionActivity } from '@/lib/security/session-activity';
import { createLogimailServerClient } from '@/lib/supabase-server';

export type AuthStatus = 'not_configured' | 'unauthenticated' | 'unregistered' | 'pending' | 'approved' | 'rejected' | 'suspended';

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  platform_role: string;
  account_status: string;
  created_at: string;
  updated_at: string;
};

export type AccountRequestRow = {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  purpose: string | null;
  requested_workspace_name: string | null;
  requested_slug: string | null;
  status: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

export type DomainRow = {
  id: string;
  workspace_id: string;
  domain: string;
  mail_hostname: string | null;
  approval_status: string;
  registration_enabled: boolean;
  status: string;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  mx_status: string;
  ptr_status: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DomainRequestRow = {
  id: string;
  workspace_id: string;
  requested_by: string;
  domain: string;
  mail_hostname: string;
  cloudflare_zone_id: string | null;
  purpose: string | null;
  dns_plan: unknown;
  risk_flags: string[] | null;
  status: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  provisioned_domain_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MailboxRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  email_address: string;
  display_name: string | null;
  quota_mb: number;
  status: string;
  provider: string;
  provider_mailbox_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MailboxRequestRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  requested_by: string;
  local_part: string;
  email_address: string;
  display_name: string | null;
  quota_mb: number;
  status: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  provisioned_mailbox_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MailboxPermissionRow = {
  id: string;
  mailbox_id: string;
  user_id: string;
  permission: string;
  created_at: string;
};

export type MailboxAliasRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string;
  domain_id: string;
  local_part: string;
  alias_email: string;
  display_name: string | null;
  status: string;
  provider_alias_id: string | null;
  created_by: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type MailLabelRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

export type MailRuleRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string;
  user_id: string;
  name: string;
  from_contains: string | null;
  subject_contains: string | null;
  action: string;
  label_id: string | null;
  enabled: boolean;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type MailDraftRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string;
  user_id: string;
  to_email: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  body_preview: string | null;
  body_sha256: string | null;
  attachment_count: number;
  in_reply_to: string | null;
  references_header: string | null;
  status: string;
  updated_at: string;
  created_at: string;
};

export type TeamMailboxTaskRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string;
  message_uid: number | null;
  subject: string | null;
  customer_email: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_by: string | null;
  due_at: string | null;
  internal_note: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type DeliverabilityCheckRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  score: number;
  mx_status: string;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  ptr_status: string;
  bimi_status: string;
  mta_sts_status: string;
  spam_rate: number | null;
  notes: string | null;
  checked_by: string | null;
  created_at: string;
};

export type DmarcReportRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  report_domain: string;
  source_ip: string | null;
  disposition: string | null;
  dkim_result: string | null;
  spf_result: string | null;
  message_count: number;
  pass_count: number;
  fail_count: number;
  report_start: string | null;
  report_end: string | null;
  metadata: unknown;
  created_at: string;
};

export type BounceEventRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string | null;
  domain_id: string | null;
  recipient_email: string;
  sender_email: string | null;
  subject: string | null;
  bounce_type: string;
  smtp_code: string | null;
  reason: string | null;
  provider_message_id: string | null;
  created_at: string;
};

export type BackupJobRow = {
  id: string;
  workspace_id: string;
  scope: string;
  domain_id: string | null;
  mailbox_id: string | null;
  status: string;
  requested_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  artifact_uri: string | null;
  error_message: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type EmailSendLogRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string | null;
  from_email: string;
  to_email: string;
  subject: string | null;
  status: string;
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  workspace_id: string | null;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: unknown;
  created_at: string;
};

export type QuotaRow = {
  id: string;
  workspace_id: string;
  daily_send_limit: number;
  monthly_send_limit: number;
  used_today: number;
  used_this_month: number;
  updated_at: string;
};

export type LogimailOperationalData = {
  auth: {
    status: AuthStatus;
    user: User | null;
    userEmail: string | null;
    profile: ProfileRow | null;
  };
  generatedAt: string;
  errors: string[];
  accountRequests: AccountRequestRow[];
  workspaces: WorkspaceRow[];
  activeWorkspace: WorkspaceRow | null;
  workspaceMembers: WorkspaceMemberRow[];
  domains: DomainRow[];
  domainRequests: DomainRequestRow[];
  mailboxes: MailboxRow[];
  mailboxRequests: MailboxRequestRow[];
  mailboxPermissions: MailboxPermissionRow[];
  mailboxAliases: MailboxAliasRow[];
  mailLabels: MailLabelRow[];
  mailRules: MailRuleRow[];
  mailDrafts: MailDraftRow[];
  teamMailboxTasks: TeamMailboxTaskRow[];
  deliverabilityChecks: DeliverabilityCheckRow[];
  dmarcReports: DmarcReportRow[];
  bounceEvents: BounceEventRow[];
  backupJobs: BackupJobRow[];
  emailSendLogs: EmailSendLogRow[];
  auditLogs: AuditLogRow[];
  quotas: QuotaRow | null;
};

type QueryResult<T> = { data: T | null; error: { message?: string; code?: string } | null };

const emptyArrays = {
  accountRequests: [] as AccountRequestRow[],
  workspaces: [] as WorkspaceRow[],
  workspaceMembers: [] as WorkspaceMemberRow[],
  domains: [] as DomainRow[],
  domainRequests: [] as DomainRequestRow[],
  mailboxes: [] as MailboxRow[],
  mailboxRequests: [] as MailboxRequestRow[],
  mailboxPermissions: [] as MailboxPermissionRow[],
  mailboxAliases: [] as MailboxAliasRow[],
  mailLabels: [] as MailLabelRow[],
  mailRules: [] as MailRuleRow[],
  mailDrafts: [] as MailDraftRow[],
  teamMailboxTasks: [] as TeamMailboxTaskRow[],
  deliverabilityChecks: [] as DeliverabilityCheckRow[],
  dmarcReports: [] as DmarcReportRow[],
  bounceEvents: [] as BounceEventRow[],
  backupJobs: [] as BackupJobRow[],
  emailSendLogs: [] as EmailSendLogRow[],
  auditLogs: [] as AuditLogRow[],
};

function emptyData(status: AuthStatus, user: User | null = null, profile: ProfileRow | null = null, errors: string[] = []): LogimailOperationalData {
  return {
    auth: { status, user, userEmail: user?.email ?? profile?.email ?? null, profile },
    generatedAt: new Date().toISOString(),
    errors,
    ...emptyArrays,
    activeWorkspace: null,
    quotas: null,
  };
}

function resultData<T>(result: QueryResult<T>, fallback: T, label: string, errors: string[]) {
  if (result.error) {
    const suffix = result.error.code ? ` (${result.error.code})` : '';
    errors.push(`${label}: ${result.error.message ?? 'Supabase query failed'}${suffix}`);
    return fallback;
  }
  return result.data ?? fallback;
}

export async function getLogimailOperationalData(): Promise<LogimailOperationalData> {
  const supabase = await createLogimailServerClient();
  if (!supabase) return emptyData('not_configured', null, null, ['Thieu NEXT_PUBLIC_SUPABASE_URL hoac NEXT_PUBLIC_SUPABASE_ANON_KEY.']);

  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (userResult.error || !user) return emptyData('unauthenticated');

  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error) {
    return emptyData('not_configured', user, null, ['session_activity_unavailable']);
  }
  if (!claimsResult.data) return emptyData('unauthenticated');

  const activity = await enforceVerifiedSessionActivity({
    userId: user.id,
    sessionId: claimsResult.data.claims.session_id,
  });
  if (activity.status === 'idle_expired' || activity.status === 'revoked' || activity.status === 'invalid_session') {
    return emptyData('unauthenticated');
  }
  if (activity.status === 'unavailable') {
    return emptyData('not_configured', user, null, ['session_activity_unavailable']);
  }

  const errors: string[] = [];
  const [profileResult, accountRequestsResult, workspacesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,full_name,avatar_url,role,platform_role,account_status,created_at,updated_at')
      .eq('id', user.id)
      .maybeSingle() as unknown as Promise<QueryResult<ProfileRow>>,
    supabase
      .from('account_requests')
      .select('id,email,full_name,company_name,purpose,requested_workspace_name,requested_slug,status,reviewed_at,rejection_reason,created_at,updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10) as unknown as Promise<QueryResult<AccountRequestRow[]>>,
    supabase
      .from('workspaces')
      .select('id,name,slug,owner_id,plan,status,created_at,updated_at')
      .order('created_at', { ascending: false }) as unknown as Promise<QueryResult<WorkspaceRow[]>>,
  ]);

  const profile = resultData(profileResult, null, 'profiles', errors);
  const accountRequests = resultData(accountRequestsResult, [], 'account_requests', errors);
  const workspaces = resultData(workspacesResult, [], 'workspaces', errors);
  const activeWorkspace = workspaces.find((workspace) => workspace.status === 'active') ?? workspaces[0] ?? null;
  const latestRequest = accountRequests[0];
  const accountStatus = profile?.account_status ?? latestRequest?.status ?? 'unregistered';

  if (accountStatus !== 'approved' || !activeWorkspace) {
    const status = accountStatus === 'rejected' ? 'rejected' : accountStatus === 'suspended' ? 'suspended' : accountStatus === 'pending' ? 'pending' : 'unregistered';
    return {
      ...emptyData(status, user, profile, errors),
      accountRequests,
      workspaces,
      activeWorkspace,
    };
  }

  const workspaceId = activeWorkspace.id;
  const [
    membersResult,
    domainsResult,
    domainRequestsResult,
    mailboxesResult,
    mailboxRequestsResult,
    permissionsResult,
    aliasesResult,
    labelsResult,
    rulesResult,
    draftsResult,
    teamTasksResult,
    deliverabilityResult,
    dmarcReportsResult,
    bounceEventsResult,
    backupJobsResult,
    sendLogsResult,
    auditLogsResult,
    quotaResult,
  ] = await Promise.all([
    supabase.from('workspace_members').select('id,workspace_id,user_id,role,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: true }) as unknown as Promise<QueryResult<WorkspaceMemberRow[]>>,
    supabase.from('domains').select('id,workspace_id,domain,mail_hostname,approval_status,registration_enabled,status,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }) as unknown as Promise<QueryResult<DomainRow[]>>,
    supabase.from('domain_requests').select('id,workspace_id,requested_by,domain,mail_hostname,cloudflare_zone_id,purpose,dns_plan,risk_flags,status,reviewed_at,rejection_reason,provisioned_domain_id,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50) as unknown as Promise<QueryResult<DomainRequestRow[]>>,
    supabase.from('mailboxes').select('id,workspace_id,domain_id,email_address,display_name,quota_mb,status,provider,provider_mailbox_id,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }) as unknown as Promise<QueryResult<MailboxRow[]>>,
    supabase.from('mailbox_requests').select('id,workspace_id,domain_id,requested_by,local_part,email_address,display_name,quota_mb,status,reviewed_at,rejection_reason,provisioned_mailbox_id,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50) as unknown as Promise<QueryResult<MailboxRequestRow[]>>,
    supabase.from('mailbox_permissions').select('id,mailbox_id,user_id,permission,created_at').order('created_at', { ascending: false }) as unknown as Promise<QueryResult<MailboxPermissionRow[]>>,
    supabase.from('mailbox_aliases').select('id,workspace_id,mailbox_id,domain_id,local_part,alias_email,display_name,status,provider_alias_id,created_by,metadata,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200) as unknown as Promise<QueryResult<MailboxAliasRow[]>>,
    supabase.from('mail_labels').select('id,workspace_id,mailbox_id,user_id,name,color,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200) as unknown as Promise<QueryResult<MailLabelRow[]>>,
    supabase.from('mail_rules').select('id,workspace_id,mailbox_id,user_id,name,from_contains,subject_contains,action,label_id,enabled,metadata,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200) as unknown as Promise<QueryResult<MailRuleRow[]>>,
    supabase.from('mail_drafts').select('id,workspace_id,mailbox_id,user_id,to_email,cc,bcc,subject,body_preview,body_sha256,attachment_count,in_reply_to,references_header,status,updated_at,created_at').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(50) as unknown as Promise<QueryResult<MailDraftRow[]>>,
    supabase.from('team_mailbox_tasks').select('id,workspace_id,mailbox_id,message_uid,subject,customer_email,status,priority,assigned_to,created_by,due_at,internal_note,metadata,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100) as unknown as Promise<QueryResult<TeamMailboxTaskRow[]>>,
    supabase.from('deliverability_checks').select('id,workspace_id,domain_id,score,mx_status,spf_status,dkim_status,dmarc_status,ptr_status,bimi_status,mta_sts_status,spam_rate,notes,checked_by,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100) as unknown as Promise<QueryResult<DeliverabilityCheckRow[]>>,
    supabase.from('dmarc_reports').select('id,workspace_id,domain_id,report_domain,source_ip,disposition,dkim_result,spf_result,message_count,pass_count,fail_count,report_start,report_end,metadata,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100) as unknown as Promise<QueryResult<DmarcReportRow[]>>,
    supabase.from('bounce_events').select('id,workspace_id,mailbox_id,domain_id,recipient_email,sender_email,subject,bounce_type,smtp_code,reason,provider_message_id,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100) as unknown as Promise<QueryResult<BounceEventRow[]>>,
    supabase.from('backup_jobs').select('id,workspace_id,scope,domain_id,mailbox_id,status,requested_by,started_at,completed_at,artifact_uri,error_message,metadata,created_at,updated_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50) as unknown as Promise<QueryResult<BackupJobRow[]>>,
    supabase.from('email_send_logs').select('id,workspace_id,mailbox_id,from_email,to_email,subject,status,provider_message_id,error_message,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(300) as unknown as Promise<QueryResult<EmailSendLogRow[]>>,
    supabase.from('audit_logs').select('id,workspace_id,actor_id,action,target_type,target_id,metadata,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100) as unknown as Promise<QueryResult<AuditLogRow[]>>,
    supabase.from('quotas').select('id,workspace_id,daily_send_limit,monthly_send_limit,used_today,used_this_month,updated_at').eq('workspace_id', workspaceId).maybeSingle() as unknown as Promise<QueryResult<QuotaRow>>,
  ]);

  return {
    auth: { status: 'approved', user, userEmail: user.email ?? profile?.email ?? null, profile },
    generatedAt: new Date().toISOString(),
    errors,
    accountRequests,
    workspaces,
    activeWorkspace,
    workspaceMembers: resultData(membersResult, [], 'workspace_members', errors),
    domains: resultData(domainsResult, [], 'domains', errors),
    domainRequests: resultData(domainRequestsResult, [], 'domain_requests', errors),
    mailboxes: resultData(mailboxesResult, [], 'mailboxes', errors),
    mailboxRequests: resultData(mailboxRequestsResult, [], 'mailbox_requests', errors),
    mailboxPermissions: resultData(permissionsResult, [], 'mailbox_permissions', errors),
    mailboxAliases: resultData(aliasesResult, [], 'mailbox_aliases', errors),
    mailLabels: resultData(labelsResult, [], 'mail_labels', errors),
    mailRules: resultData(rulesResult, [], 'mail_rules', errors),
    mailDrafts: resultData(draftsResult, [], 'mail_drafts', errors),
    teamMailboxTasks: resultData(teamTasksResult, [], 'team_mailbox_tasks', errors),
    deliverabilityChecks: resultData(deliverabilityResult, [], 'deliverability_checks', errors),
    dmarcReports: resultData(dmarcReportsResult, [], 'dmarc_reports', errors),
    bounceEvents: resultData(bounceEventsResult, [], 'bounce_events', errors),
    backupJobs: resultData(backupJobsResult, [], 'backup_jobs', errors),
    emailSendLogs: resultData(sendLogsResult, [], 'email_send_logs', errors),
    auditLogs: resultData(auditLogsResult, [], 'audit_logs', errors),
    quotas: resultData(quotaResult, null, 'quotas', errors),
  };
}

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  if (['active', 'approved', 'pass', 'sent', 'completed', 'connected'].includes(status)) return 'success';
  if (['pending', 'warning', 'queued', 'deferred', 'metadata_ready', 'provisioning'].includes(status)) return 'warning';
  if (['failed', 'fail', 'rejected', 'locked', 'disabled', 'suspended', 'bounced'].includes(status)) return 'danger';
  if (['unknown', 'internal', 'pilot'].includes(status)) return 'info';
  return 'neutral';
}

export function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    active: 'Hoạt động',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    suspended: 'Tạm dừng',
    pending: 'Chờ duyệt',
    warning: 'Cần chú ý',
    failed: 'Lỗi',
    disabled: 'Đã tắt',
    locked: 'Đã khóa',
    pass: 'Pass',
    fail: 'Fail',
    unknown: 'Chưa rõ',
    queued: 'Đang chờ',
    sent: 'Đã gửi',
    bounced: 'Bị trả lại',
    deferred: 'Hoãn gửi',
  };
  return status ? labels[status] ?? status : 'Chưa có dữ liệu';
}

export function dateTime(value: string | null | undefined) {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function shortDate(value: string | null | undefined) {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(value));
}

export function slugFromDomain(domain: string) {
  return domain.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

export function findDomain(data: LogimailOperationalData, id: string) {
  if (id === 'current') return data.domains[0] ?? null;
  return data.domains.find((domain) => domain.id === id || slugFromDomain(domain.domain) === id) ?? data.domains[0] ?? null;
}

export function findMailbox(data: LogimailOperationalData, id: string) {
  return data.mailboxes.find((mailbox) => mailbox.id === id || slugFromDomain(mailbox.email_address) === id) ?? data.mailboxes[0] ?? null;
}

export function permissionForMailbox(data: LogimailOperationalData, mailboxId: string) {
  const currentUserId = data.auth.user?.id;
  const permission = data.mailboxPermissions.find((item) => item.mailbox_id === mailboxId && item.user_id === currentUserId);
  const mailbox = data.mailboxes.find((item) => item.id === mailboxId);
  return resolveMailboxPermission({
    mailboxEmail: mailbox?.email_address ?? '',
    userEmail: data.auth.userEmail,
    permission: permission?.permission,
    fallback: 'member',
  });
}

export function aliasesForMailbox(data: LogimailOperationalData, mailboxId: string) {
  return data.mailboxAliases.filter((alias) => alias.mailbox_id === mailboxId);
}

export function aliasesForDomain(data: LogimailOperationalData, domainId: string) {
  return data.mailboxAliases.filter((alias) => alias.domain_id === domainId);
}

export function labelsForMailbox(data: LogimailOperationalData, mailboxId: string) {
  return data.mailLabels.filter((label) => label.mailbox_id === mailboxId);
}

export function rulesForMailbox(data: LogimailOperationalData, mailboxId: string) {
  return data.mailRules.filter((rule) => rule.mailbox_id === mailboxId);
}

export function draftsForMailbox(data: LogimailOperationalData, mailboxId?: string | null) {
  return mailboxId ? data.mailDrafts.filter((draft) => draft.mailbox_id === mailboxId) : data.mailDrafts;
}

export function tasksForMailbox(data: LogimailOperationalData, mailboxId?: string | null) {
  return mailboxId ? data.teamMailboxTasks.filter((task) => task.mailbox_id === mailboxId) : data.teamMailboxTasks;
}

export function latestDeliverabilityForDomain(data: LogimailOperationalData, domainId: string) {
  return data.deliverabilityChecks.find((item) => item.domain_id === domainId) ?? null;
}

export function dmarcReportsForDomain(data: LogimailOperationalData, domainId: string) {
  return data.dmarcReports.filter((item) => item.domain_id === domainId);
}

export function bounceEventsForDomain(data: LogimailOperationalData, domainId: string) {
  return data.bounceEvents.filter((item) => item.domain_id === domainId);
}

export function backupSummary(data: LogimailOperationalData) {
  const latest = data.backupJobs[0] ?? null;
  const failed = data.backupJobs.filter((job) => job.status === 'failed').length;
  const completed = data.backupJobs.filter((job) => job.status === 'completed').length;
  return { latest, failed, completed, total: data.backupJobs.length };
}

export function domainScore(domain: DomainRow) {
  const signals = [domain.mx_status, domain.spf_status, domain.dkim_status, domain.dmarc_status, domain.ptr_status];
  const passed = signals.filter((signal) => signal === 'pass').length;
  const warning = signals.filter((signal) => signal === 'warning').length;
  return Math.max(0, Math.min(100, Math.round((passed / signals.length) * 100 - warning * 8)));
}

export function deliverabilityScore(data: LogimailOperationalData, domain: DomainRow) {
  return latestDeliverabilityForDomain(data, domain.id)?.score ?? domainScore(domain);
}

export function bounceSummary(events: BounceEventRow[]) {
  const hard = events.filter((item) => item.bounce_type === 'hard').length;
  const soft = events.filter((item) => item.bounce_type === 'soft').length;
  const complaints = events.filter((item) => item.bounce_type === 'complaint').length;
  const blocked = events.filter((item) => item.bounce_type === 'blocked').length;
  return { hard, soft, complaints, blocked, total: events.length };
}

export function buildSendVolume(logs: EmailSendLogRow[]) {
  const today = new Date();
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (7 - index));
    const key = date.toISOString().slice(0, 10);
    const dayLogs = logs.filter((log) => log.created_at.slice(0, 10) === key);
    return {
      day: index === 7 ? 'Hôm nay' : new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date),
      sent: dayLogs.filter((log) => log.status === 'sent').length,
      received: dayLogs.length,
    };
  });
}

export function buildShellStatus(data: LogimailOperationalData): ShellStatusItem[] {
  if (data.auth.status !== 'approved') return [];
  const activeDomains = data.domains.filter((domain) => domain.status === 'active').length;
  const activeMailboxes = data.mailboxes.filter((mailbox) => mailbox.status === 'active').length;
  const pendingRequests = data.domainRequests.filter((item) => item.status === 'pending').length + data.mailboxRequests.filter((item) => item.status === 'pending').length;
  const quota = data.quotas;
  return [
    { label: 'Workspace', value: data.activeWorkspace?.status ? statusLabel(data.activeWorkspace.status) : 'Chưa có', tone: statusTone(data.activeWorkspace?.status) },
    { label: 'Domain', value: `${activeDomains}/${data.domains.length}`, tone: activeDomains === data.domains.length && activeDomains > 0 ? 'success' : 'warning' },
    { label: 'Mailbox', value: String(activeMailboxes), tone: activeMailboxes > 0 ? 'success' : 'info' },
    { label: 'Yêu cầu', value: String(pendingRequests), tone: pendingRequests > 0 ? 'warning' : 'success' },
    quota ? { label: 'Quota ngày', value: `${quota.used_today}/${quota.daily_send_limit}`, tone: quota.used_today <= quota.daily_send_limit ? 'success' : 'warning' } : { label: 'Quota ngày', value: 'Chưa có', tone: 'info' },
  ];
}

export function expectedDnsRecords(domain: DomainRow) {
  const vpsIp = process.env.LOGIMAIL_VPS_IP ?? '';
  const mailHostname = domain.mail_hostname ?? process.env.LOGIMAIL_MAIL_HOSTNAME ?? `mail.${domain.domain}`;
  return vpsIp ? buildSafeDnsPlan(domain.domain, vpsIp, mailHostname) : [];
}

export function pendingTotal(data: LogimailOperationalData) {
  return data.accountRequests.filter((item) => item.status === 'pending').length +
    data.domainRequests.filter((item) => item.status === 'pending').length +
    data.mailboxRequests.filter((item) => item.status === 'pending').length;
}
