import "server-only";

import { resolve4, resolveMx, resolveTxt, reverse } from "node:dns/promises";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { emptySecurityCodeCenter, getLogimailSecurityCodeCenter, type LogimailSecurityCodeCenter } from "@/services/logimail-security-code-service";

export type LogimailApprovalRequestType = "account" | "domain" | "mailbox";

export type LogimailApprovalRequestView = {
  id: string;
  type: LogimailApprovalRequestType;
  status: string;
  title: string;
  detail: string;
  secondary: string | null;
  requesterUserId: string;
  requesterEmail: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceSlug: string | null;
  targetValue: string;
  riskFlags: string[];
  plannedRecordCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LogimailDnsRecordView = {
  type: "A" | "MX" | "TXT";
  name: string;
  content: string;
  priority?: number;
  proxied?: boolean;
};

export type LogimailDomainView = {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  workspaceSlug: string | null;
  domain: string;
  mailHostname: string | null;
  status: string;
  approvalStatus: string;
  registrationEnabled: boolean;
  dns: {
    mx: string;
    spf: string;
    dkim: string;
    dmarc: string;
    ptr: string;
    lastCheckedAt: string | null;
  };
  mailboxCount: number;
  plannedRecords: LogimailDnsRecordView[];
  createdAt: string;
  updatedAt: string;
};

export type LogimailDomainControl = {
  schemaReady: boolean;
  generatedAt: string;
  summary: {
    total: number;
    active: number;
    registrationEnabled: number;
    warning: number;
    cloudflareReady: boolean;
  };
  workspaces: Array<{ id: string; name: string; slug: string; status: string }>;
  domains: LogimailDomainView[];
  warnings: string[];
};

export type LogimailApprovalQueue = {
  schemaReady: boolean;
  generatedAt: string;
  summary: {
    pendingTotal: number;
    accounts: number;
    domains: number;
    mailboxes: number;
    risk: "ready" | "warning" | "blocked";
  };
  requests: LogimailApprovalRequestView[];
  securityCodes: LogimailSecurityCodeCenter;
  domainControl: LogimailDomainControl;
  warnings: string[];
};

type AccountRequestRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  purpose: string | null;
  requested_workspace_name: string | null;
  requested_slug: string | null;
  status: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type DomainRequestRow = {
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
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type MailboxRequestRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  requested_by: string;
  local_part: string;
  email_address: string;
  display_name: string | null;
  quota_mb: number;
  status: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
};

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
  created_at?: string;
  updated_at?: string;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  account_status: string;
};

export async function getLogimailApprovalQueue(limit = 20): Promise<LogimailApprovalQueue> {
  const warnings: string[] = [];
  try {
    const db = logimailDb();
    const [securityCodes, domainControl] = await Promise.all([
      getLogimailSecurityCodeCenter().catch((error) => {
        warnings.push(`Không đọc được mã bảo mật LogiMail: ${error instanceof Error ? error.message : String(error)}`);
        return emptySecurityCodeCenter(["Không đọc được mã bảo mật LogiMail."]);
      }),
      getLogimailDomainControl().catch((error) => {
        warnings.push(`Không đọc được domain LogiMail: ${error instanceof Error ? error.message : String(error)}`);
        return emptyDomainControl(["Không đọc được domain LogiMail."]);
      })
    ]);
    const [accountsResult, domainsResult, mailboxesResult] = await Promise.all([
      db.from("account_requests").select("id,user_id,email,full_name,company_name,purpose,requested_workspace_name,requested_slug,status,metadata,created_at,updated_at").eq("status", "pending").order("created_at", { ascending: true }).limit(limit),
      db.from("domain_requests").select("id,workspace_id,requested_by,domain,mail_hostname,cloudflare_zone_id,purpose,dns_plan,risk_flags,status,metadata,created_at,updated_at").eq("status", "pending").order("created_at", { ascending: true }).limit(limit),
      db.from("mailbox_requests").select("id,workspace_id,domain_id,requested_by,local_part,email_address,display_name,quota_mb,status,metadata,created_at,updated_at").eq("status", "pending").order("created_at", { ascending: true }).limit(limit)
    ]);

    const schemaError = [accountsResult.error, domainsResult.error, mailboxesResult.error].find(isMissingLogimailSchema);
    if (schemaError) return emptyQueue(["Thiếu schema LogiMail approval requests hoặc Data API chưa expose schema logimail."], securityCodes);
    if (accountsResult.error) throw accountsResult.error;
    if (domainsResult.error) throw domainsResult.error;
    if (mailboxesResult.error) throw mailboxesResult.error;

    const accounts = (accountsResult.data ?? []) as AccountRequestRow[];
    const domains = (domainsResult.data ?? []) as DomainRequestRow[];
    const mailboxes = (mailboxesResult.data ?? []) as MailboxRequestRow[];
    const workspaceIds = uniqueStrings([
      ...domains.map((row) => row.workspace_id),
      ...mailboxes.map((row) => row.workspace_id)
    ]);
    const domainIds = uniqueStrings(mailboxes.map((row) => row.domain_id));
    const requesterIds = uniqueStrings([
      ...accounts.map((row) => row.user_id),
      ...domains.map((row) => row.requested_by),
      ...mailboxes.map((row) => row.requested_by)
    ]);

    const [workspaces, domainRows, profiles] = await Promise.all([
      readWorkspaces(workspaceIds, warnings),
      readDomains(domainIds, warnings),
      readProfiles(requesterIds, warnings)
    ]);

    const workspaceById = new Map(workspaces.map((row) => [row.id, row]));
    const domainById = new Map(domainRows.map((row) => [row.id, row]));
    const profileById = new Map(profiles.map((row) => [row.id, row]));
    const requests = [
      ...accounts.map((row) => mapAccountRequest(row)),
      ...domains.map((row) => mapDomainRequest(row, workspaceById.get(row.workspace_id), profileById.get(row.requested_by))),
      ...mailboxes.map((row) => mapMailboxRequest(row, workspaceById.get(row.workspace_id), domainById.get(row.domain_id), profileById.get(row.requested_by)))
    ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()).slice(0, limit);

    return {
      schemaReady: true,
      generatedAt: new Date().toISOString(),
      summary: {
        pendingTotal: accounts.length + domains.length + mailboxes.length,
        accounts: accounts.length,
        domains: domains.length,
        mailboxes: mailboxes.length,
        risk: accounts.length + domains.length + mailboxes.length > 0 ? "warning" : "ready"
      },
      requests,
      securityCodes,
      domainControl,
      warnings: Array.from(new Set(warnings))
    };
  } catch (error) {
    if (isMissingLogimailSchema(error)) return emptyQueue(["Thiếu schema LogiMail approval requests hoặc quyền service role."]);
    throw error;
  }
}

export async function getLogimailDomainControl(): Promise<LogimailDomainControl> {
  const warnings: string[] = [];
  const db = logimailDb();
  const [domainsResult, workspacesResult] = await Promise.all([
    db
      .from("domains")
      .select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at,created_at,updated_at")
      .order("domain", { ascending: true }),
    db.from("workspaces").select("id,name,slug,status").order("created_at", { ascending: true })
  ]);

  if (isMissingLogimailSchema(domainsResult.error) || isMissingLogimailSchema(workspacesResult.error)) {
    return emptyDomainControl(["Thiếu schema LogiMail domains/workspaces hoặc quyền service role."]);
  }
  if (domainsResult.error) throw domainsResult.error;
  if (workspacesResult.error) throw workspacesResult.error;

  const domains = (domainsResult.data ?? []) as DomainRow[];
  const workspaces = ((workspacesResult.data ?? []) as Array<{ id: string; name: string; slug: string; status: string }>);
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const mailboxCounts = await readMailboxCounts(domains.map((domain) => domain.id), warnings);
  const mapped = domains.map((domain) => mapDomainControlRow(domain, workspaceById.get(domain.workspace_id), mailboxCounts.get(domain.id) ?? 0));
  const warningCount = mapped.filter((domain) => [domain.status, domain.dns.mx, domain.dns.spf, domain.dns.dkim, domain.dns.dmarc, domain.dns.ptr].some((status) => ["warning", "failed", "fail", "unknown"].includes(status))).length;

  return {
    schemaReady: true,
    generatedAt: new Date().toISOString(),
    summary: {
      total: mapped.length,
      active: mapped.filter((domain) => domain.status === "active" && domain.approvalStatus === "approved").length,
      registrationEnabled: mapped.filter((domain) => domain.registrationEnabled).length,
      warning: warningCount,
      cloudflareReady: Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID)
    },
    workspaces,
    domains: mapped,
    warnings
  };
}

export async function createLogimailDomainForAdmin(input: { domain: string; mailHostname?: string | null; workspaceId?: string | null; registrationEnabled?: boolean; actor: string }) {
  const db = logimailDb();
  const domain = normalizeLogimailDomain(input.domain);
  const mailHostname = normalizeLogimailDomain(input.mailHostname || process.env.LOGIMAIL_MAIL_HOSTNAME || "mail.logivn.com");
  const workspace = input.workspaceId ? await getWorkspaceById(input.workspaceId) : await getDefaultLogimailWorkspace();
  const now = new Date().toISOString();

  const existing = await db.from("domains").select("id").eq("domain", domain).limit(1).maybeSingle();
  if (existing.error) throw existing.error;

  const payload = {
    workspace_id: workspace.id,
    domain,
    mail_hostname: mailHostname,
    status: "active",
    approval_status: "approved",
    registration_enabled: input.registrationEnabled ?? true,
    updated_at: now
  };

  const query = existing.data?.id
    ? db.from("domains").update(payload).eq("id", existing.data.id)
    : db.from("domains").insert(payload);

  const { data, error } = await query
    .select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at,created_at,updated_at")
    .single();
  if (error) throw error;

  await writeLogimailAudit({
    workspaceId: workspace.id,
    actor: input.actor,
    action: existing.data?.id ? "logimail.domain_updated_admin" : "logimail.domain_created_admin",
    targetType: "domain",
    targetId: String(data.id),
    metadata: { domain, mailHostname, registrationEnabled: payload.registration_enabled }
  });
  await writePlatformAuditLog({
    actor: input.actor,
    action: existing.data?.id ? "logimail_domain_updated" : "logimail_domain_created",
    targetType: "logimail_domain",
    targetId: String(data.id),
    metadata: { domain, workspaceId: workspace.id }
  });
  return data as DomainRow;
}

export async function updateLogimailDomainForAdmin(input: { domainId: string; mailHostname?: string | null; status?: string | null; registrationEnabled?: boolean; actor: string }) {
  const current = await getDomain(input.domainId);
  if (!current) throw new AppError("Không tìm thấy domain LogiMail.", 404);
  const status = input.status ? normalizeDomainStatus(input.status) : current.status;
  const mailHostname = input.mailHostname ? normalizeLogimailDomain(input.mailHostname) : current.mail_hostname;
  const { data, error } = await logimailDb()
    .from("domains")
    .update({
      mail_hostname: mailHostname,
      status,
      registration_enabled: input.registrationEnabled ?? current.registration_enabled,
      updated_at: new Date().toISOString()
    })
    .eq("id", current.id)
    .select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at,created_at,updated_at")
    .single();
  if (error) throw error;
  await writeLogimailAudit({ workspaceId: current.workspace_id, actor: input.actor, action: "logimail.domain_updated_admin", targetType: "domain", targetId: current.id, metadata: { status, mailHostname, registrationEnabled: input.registrationEnabled ?? current.registration_enabled } });
  await writePlatformAuditLog({ actor: input.actor, action: "logimail_domain_updated", targetType: "logimail_domain", targetId: current.id, metadata: { status, mailHostname } });
  return data as DomainRow;
}

export async function setLogimailDomainRegistrationForAdmin(input: { domainId: string; enabled: boolean; actor: string }) {
  const current = await getDomain(input.domainId);
  if (!current) throw new AppError("Không tìm thấy domain LogiMail.", 404);
  const { data, error } = await logimailDb()
    .from("domains")
    .update({ registration_enabled: input.enabled, status: input.enabled ? "active" : current.status, updated_at: new Date().toISOString() })
    .eq("id", current.id)
    .select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled")
    .single();
  if (error) throw error;
  await writeLogimailAudit({ workspaceId: current.workspace_id, actor: input.actor, action: input.enabled ? "logimail.domain_registration_enabled" : "logimail.domain_registration_disabled", targetType: "domain", targetId: current.id, metadata: { domain: current.domain } });
  await writePlatformAuditLog({ actor: input.actor, action: input.enabled ? "logimail_domain_registration_enabled" : "logimail_domain_registration_disabled", targetType: "logimail_domain", targetId: current.id, metadata: { domain: current.domain } });
  return data as DomainRow;
}

export async function removeLogimailDomainForAdmin(input: { domainId: string; actor: string }) {
  const current = await getDomain(input.domainId);
  if (!current) throw new AppError("Không tìm thấy domain LogiMail.", 404);
  const mailboxCount = await countDomainMailboxes(current.id);
  if (mailboxCount > 0) {
    const { data, error } = await logimailDb()
      .from("domains")
      .update({ status: "disabled", registration_enabled: false, updated_at: new Date().toISOString() })
      .eq("id", current.id)
      .select("id,workspace_id,domain,status,registration_enabled")
      .single();
    if (error) throw error;
    await writeLogimailAudit({ workspaceId: current.workspace_id, actor: input.actor, action: "logimail.domain_disabled_admin", targetType: "domain", targetId: current.id, metadata: { domain: current.domain, mailboxCount } });
    await writePlatformAuditLog({ actor: input.actor, action: "logimail_domain_disabled", targetType: "logimail_domain", targetId: current.id, metadata: { domain: current.domain, mailboxCount } });
    return { mode: "disabled" as const, domain: data };
  }

  const { error } = await logimailDb().from("domains").delete().eq("id", current.id);
  if (error) throw error;
  await writeLogimailAudit({ workspaceId: current.workspace_id, actor: input.actor, action: "logimail.domain_deleted_admin", targetType: "domain", targetId: current.id, metadata: { domain: current.domain } });
  await writePlatformAuditLog({ actor: input.actor, action: "logimail_domain_deleted", targetType: "logimail_domain", targetId: current.id, metadata: { domain: current.domain } });
  return { mode: "deleted" as const, domain: current };
}

export async function checkLogimailDomainDnsForAdmin(input: { domainId: string; actor: string }) {
  const current = await getDomain(input.domainId);
  if (!current) throw new AppError("Không tìm thấy domain LogiMail.", 404);
  const mailHostname = current.mail_hostname || process.env.LOGIMAIL_MAIL_HOSTNAME || "mail.logivn.com";
  const status = await resolveDomainDnsStatus(current.domain, mailHostname);
  const { data, error } = await logimailDb()
    .from("domains")
    .update({
      mx_status: status.mx,
      spf_status: status.spf,
      dkim_status: status.dkim,
      dmarc_status: status.dmarc,
      ptr_status: status.ptr,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", current.id)
    .select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at,created_at,updated_at")
    .single();
  if (error) throw error;
  await writeLogimailAudit({ workspaceId: current.workspace_id, actor: input.actor, action: "logimail.domain_dns_checked_admin", targetType: "domain", targetId: current.id, metadata: { domain: current.domain, ...status } });
  await writePlatformAuditLog({ actor: input.actor, action: "logimail_domain_dns_checked", targetType: "logimail_domain", targetId: current.id, metadata: { domain: current.domain, ...status } });
  return data as DomainRow;
}

export async function checkAllLogimailDomainDnsForAdmin(input: { actor: string }) {
  const { data, error } = await logimailDb()
    .from("domains")
    .select("id,domain")
    .in("status", ["active", "warning", "pending"])
    .order("domain", { ascending: true })
    .limit(25);
  if (error) throw error;

  const results: Array<{ domainId: string; domain: string; ok: boolean; error?: string }> = [];
  for (const row of (data ?? []) as Array<{ id: string; domain: string }>) {
    try {
      await checkLogimailDomainDnsForAdmin({ domainId: row.id, actor: input.actor });
      results.push({ domainId: row.id, domain: row.domain, ok: true });
    } catch (error) {
      results.push({
        domainId: row.id,
        domain: row.domain,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await writePlatformAuditLog({
    actor: input.actor,
    action: "logimail_domain_dns_checked_all",
    targetType: "logimail_domain",
    metadata: {
      total: results.length,
      failed: results.filter((result) => !result.ok).length,
      domains: results.map((result) => ({ domain: result.domain, ok: result.ok, error: result.error ?? null }))
    }
  });

  return results;
}

export async function approveLogimailRequest(input: { type: LogimailApprovalRequestType; requestId: string; actor: string }) {
  if (input.type === "account") return approveAccountRequest(input.requestId, input.actor);
  if (input.type === "domain") return approveDomainRequest(input.requestId, input.actor);
  return approveMailboxRequest(input.requestId, input.actor);
}

export async function rejectLogimailRequest(input: { type: LogimailApprovalRequestType; requestId: string; actor: string; reason?: string | null }) {
  const reason = input.reason?.trim() || "Từ chối từ admin.logivn.com";
  const db = logimailDb();
  const table = requestTable(input.type);
  const current = await getPendingApprovalRequest(input.type, input.requestId);
  const { data, error } = await db
    .from(table)
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
      metadata: { ...asRecord(current.metadata), reviewedByActor: input.actor, reviewedFrom: "admin.logivn.com", rejectionReason: reason }
    })
    .eq("id", input.requestId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Yêu cầu LogiMail không còn chờ phê duyệt.", 409);

  await writeLogimailAudit({
    workspaceId: stringField(current, "workspace_id"),
    actor: input.actor,
    action: `logimail.${input.type}_request_rejected`,
    targetType: `${input.type}_request`,
    targetId: input.requestId,
    metadata: { reason, target: stringField(current, "email") ?? stringField(current, "domain") ?? stringField(current, "email_address") }
  });
  await writePlatformAuditLog({
    actor: input.actor,
    action: "logimail_request_rejected",
    targetType: "logimail_request",
    targetId: `${input.type}:${input.requestId}`,
    metadata: { requestType: input.type, reason }
  });
  return { requestId: input.requestId, requestType: input.type, status: "rejected" as const };
}

async function approveAccountRequest(requestId: string, actor: string) {
  const db = logimailDb();
  const request = await getPendingAccountRequest(requestId);
  const workspaceName = request.requested_workspace_name || request.company_name || `LogiMail ${request.email}`;
  const slug = await uniqueWorkspaceSlug(request.requested_slug || slugBaseFromText(request.company_name || request.email));
  const now = new Date().toISOString();
  await claimApprovalRequest({
    table: "account_requests",
    requestId: request.id,
    metadata: request.metadata,
    actor,
    source: "admin.logivn.com",
    now,
    extraMetadata: { plannedWorkspaceSlug: slug }
  });

  let workspace: WorkspaceRow;
  try {
    const profileResult = await db.from("profiles").upsert({
      id: request.user_id,
      email: request.email,
      full_name: request.full_name || request.email,
      role: "owner",
      account_status: "approved",
      updated_at: now
    }, { onConflict: "id" });
    if (profileResult.error) throw profileResult.error;

    const workspaceResult = await db
      .from("workspaces")
      .insert({ name: workspaceName, slug, owner_id: request.user_id, plan: "internal", status: "active" })
      .select("id,name,slug")
      .single();
    if (workspaceResult.error) throw workspaceResult.error;

    workspace = workspaceResult.data as WorkspaceRow;
    await db.from("workspace_members").upsert({ workspace_id: workspace.id, user_id: request.user_id, role: "owner" }, { onConflict: "workspace_id,user_id" }).then(throwOnError);
    await db.from("quotas").upsert({ workspace_id: workspace.id }, { onConflict: "workspace_id" }).then(throwOnError);

    await finalizeApprovalRequest({
      table: "account_requests",
      requestId: request.id,
      metadata: request.metadata,
      actor,
      source: "admin.logivn.com",
      extraMetadata: {
        provisionedWorkspaceId: workspace.id,
        provisionedWorkspaceSlug: workspace.slug
      }
    });
  } catch (error) {
    await markApprovalProvisioningFailed("account_requests", request.id, request.metadata, actor, "admin.logivn.com", error);
    throw error;
  }

  await writeLogimailAudit({
    workspaceId: workspace.id,
    actor,
    action: "logimail.account_request_approved",
    targetType: "account_request",
    targetId: request.id,
    metadata: { email: request.email, workspaceId: workspace.id, workspaceSlug: workspace.slug }
  });
  await writePlatformAuditLog({
    actor,
    action: "logimail_request_approved",
    targetType: "logimail_request",
    targetId: `account:${request.id}`,
    metadata: { requestType: "account", email: request.email, workspaceId: workspace.id }
  });
  return { requestId: request.id, requestType: "account" as const, status: "approved" as const, workspaceId: workspace.id, workspaceSlug: workspace.slug };
}

async function approveDomainRequest(requestId: string, actor: string) {
  const db = logimailDb();
  const request = await getPendingDomainRequest(requestId);
  const now = new Date().toISOString();
  await claimApprovalRequest({ table: "domain_requests", requestId: request.id, metadata: request.metadata, actor, source: "admin.logivn.com", now });

  let domain: DomainRow;
  try {
    const domainResult = await db
      .from("domains")
      .upsert({
        workspace_id: request.workspace_id,
        domain: request.domain,
        mail_hostname: request.mail_hostname,
        approval_status: "approved",
        registration_enabled: true,
        status: "active",
        updated_at: now
      }, { onConflict: "workspace_id,domain" })
      .select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled")
      .single();
    if (domainResult.error) throw domainResult.error;
    domain = domainResult.data as DomainRow;

    await finalizeApprovalRequest({
      table: "domain_requests",
      requestId: request.id,
      metadata: request.metadata,
      actor,
      source: "admin.logivn.com",
      provisionedColumn: "provisioned_domain_id",
      provisionedId: domain.id,
      extraMetadata: {
        provisionedDomainId: domain.id
      }
    });
  } catch (error) {
    await markApprovalProvisioningFailed("domain_requests", request.id, request.metadata, actor, "admin.logivn.com", error);
    throw error;
  }

  await writeLogimailAudit({
    workspaceId: request.workspace_id,
    actor,
    action: "logimail.domain_request_approved",
    targetType: "domain_request",
    targetId: request.id,
    metadata: { domain: request.domain, mailHostname: request.mail_hostname, provisionedDomainId: domain.id, riskFlags: request.risk_flags ?? [] }
  });
  await writePlatformAuditLog({
    actor,
    action: "logimail_request_approved",
    targetType: "logimail_request",
    targetId: `domain:${request.id}`,
    metadata: { requestType: "domain", workspaceId: request.workspace_id, domain: request.domain, provisionedDomainId: domain.id }
  });
  return { requestId: request.id, requestType: "domain" as const, status: "approved" as const, domainId: domain.id };
}

async function approveMailboxRequest(requestId: string, actor: string) {
  const db = logimailDb();
  const request = await getPendingMailboxRequest(requestId);
  const domain = await getDomain(request.domain_id);
  if (!domain || domain.workspace_id !== request.workspace_id || domain.status !== "active" || domain.approval_status !== "approved") {
    throw new AppError("Domain của mailbox chưa được duyệt hoặc không còn active.", 409);
  }
  const now = new Date().toISOString();
  await claimApprovalRequest({ table: "mailbox_requests", requestId: request.id, metadata: request.metadata, actor, source: "admin.logivn.com", now });

  let mailbox: { id: string; email_address: string };
  try {
    const mailboxResult = await db
      .from("mailboxes")
      .upsert({
        workspace_id: request.workspace_id,
        domain_id: request.domain_id,
        email_address: request.email_address,
        display_name: request.display_name,
        quota_mb: request.quota_mb,
        status: "active",
        provider: "billionmail",
        updated_at: now
      }, { onConflict: "email_address" })
      .select("id,email_address")
      .single();
    if (mailboxResult.error) throw mailboxResult.error;
    mailbox = mailboxResult.data as { id: string; email_address: string };

    await db.from("mailbox_permissions").upsert({ mailbox_id: mailbox.id, user_id: request.requested_by, permission: "admin" }, { onConflict: "mailbox_id,user_id" }).then(throwOnError);

    await finalizeApprovalRequest({
      table: "mailbox_requests",
      requestId: request.id,
      metadata: request.metadata,
      actor,
      source: "admin.logivn.com",
      provisionedColumn: "provisioned_mailbox_id",
      provisionedId: mailbox.id,
      extraMetadata: {
        provisionedMailboxId: mailbox.id
      }
    });
  } catch (error) {
    await markApprovalProvisioningFailed("mailbox_requests", request.id, request.metadata, actor, "admin.logivn.com", error);
    throw error;
  }

  await writeLogimailAudit({
    workspaceId: request.workspace_id,
    actor,
    action: "logimail.mailbox_request_approved",
    targetType: "mailbox_request",
    targetId: request.id,
    metadata: { emailAddress: request.email_address, quotaMb: request.quota_mb, provisionedMailboxId: mailbox.id }
  });
  await writePlatformAuditLog({
    actor,
    action: "logimail_request_approved",
    targetType: "logimail_request",
    targetId: `mailbox:${request.id}`,
    metadata: { requestType: "mailbox", workspaceId: request.workspace_id, emailAddress: request.email_address, provisionedMailboxId: mailbox.id }
  });
  return { requestId: request.id, requestType: "mailbox" as const, status: "approved" as const, mailboxId: mailbox.id };
}

async function getPendingAccountRequest(requestId: string) {
  const { data, error } = await logimailDb().from("account_requests").select("*").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Yêu cầu tài khoản LogiMail không còn chờ phê duyệt.", 409);
  return data as AccountRequestRow;
}

async function getPendingApprovalRequest(type: LogimailApprovalRequestType, requestId: string) {
  if (type === "account") return getPendingAccountRequest(requestId) as Promise<AccountRequestRow & Record<string, unknown>>;
  if (type === "domain") return getPendingDomainRequest(requestId) as Promise<DomainRequestRow & Record<string, unknown>>;
  return getPendingMailboxRequest(requestId) as Promise<MailboxRequestRow & Record<string, unknown>>;
}

async function getPendingDomainRequest(requestId: string) {
  const { data, error } = await logimailDb().from("domain_requests").select("*").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Yêu cầu domain LogiMail không còn chờ phê duyệt.", 409);
  return data as DomainRequestRow;
}

async function getPendingMailboxRequest(requestId: string) {
  const { data, error } = await logimailDb().from("mailbox_requests").select("*").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Yêu cầu mailbox LogiMail không còn chờ phê duyệt.", 409);
  return data as MailboxRequestRow;
}

async function claimApprovalRequest(input: {
  table: string;
  requestId: string;
  metadata: unknown;
  actor: string;
  source: string;
  now: string;
  extraMetadata?: Record<string, unknown>;
}) {
  const { data, error } = await logimailDb()
    .from(input.table)
    .update({
      status: "approved",
      reviewed_at: input.now,
      metadata: {
        ...asRecord(input.metadata),
        reviewedByActor: input.actor,
        reviewedFrom: input.source,
        provisioningStatus: "provisioning",
        ...(input.extraMetadata ?? {})
      }
    })
    .eq("id", input.requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Yêu cầu LogiMail không còn chờ phê duyệt.", 409);
}

async function finalizeApprovalRequest(input: {
  table: string;
  requestId: string;
  metadata: unknown;
  actor: string;
  source: string;
  provisionedColumn?: string;
  provisionedId?: string;
  extraMetadata?: Record<string, unknown>;
}) {
  const update: Record<string, unknown> = {
    metadata: {
      ...asRecord(input.metadata),
      reviewedByActor: input.actor,
      reviewedFrom: input.source,
      provisioningStatus: "metadata_ready",
      ...(input.extraMetadata ?? {})
    }
  };
  if (input.provisionedColumn && input.provisionedId) update[input.provisionedColumn] = input.provisionedId;

  const { data, error } = await logimailDb()
    .from(input.table)
    .update(update)
    .eq("id", input.requestId)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Yêu cầu LogiMail đã được claim nhưng không thể finalize.", 409);
}

async function markApprovalProvisioningFailed(table: string, requestId: string, metadata: unknown, actor: string, source: string, error: unknown) {
  const { error: updateError } = await logimailDb()
    .from(table)
    .update({
      metadata: {
        ...asRecord(metadata),
        reviewedByActor: actor,
        reviewedFrom: source,
        provisioningStatus: "failed",
        provisioningError: errorMessage(error)
      }
    })
    .eq("id", requestId)
    .eq("status", "approved");
  if (updateError && !isMissingLogimailSchema(updateError)) throw updateError;
}

async function getDomain(domainId: string) {
  const { data, error } = await logimailDb().from("domains").select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled").eq("id", domainId).maybeSingle();
  if (error) throw error;
  return data as DomainRow | null;
}

async function readWorkspaces(ids: string[], warnings: string[]) {
  if (!ids.length) return [] as WorkspaceRow[];
  const { data, error } = await logimailDb().from("workspaces").select("id,name,slug").in("id", ids);
  if (error) {
    if (isMissingLogimailSchema(error)) {
      warnings.push("Không đọc được LogiMail workspaces.");
      return [];
    }
    throw error;
  }
  return (data ?? []) as WorkspaceRow[];
}

async function readDomains(ids: string[], warnings: string[]) {
  if (!ids.length) return [] as DomainRow[];
  const { data, error } = await logimailDb().from("domains").select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled").in("id", ids);
  if (error) {
    if (isMissingLogimailSchema(error)) {
      warnings.push("Không đọc được LogiMail domains.");
      return [];
    }
    throw error;
  }
  return (data ?? []) as DomainRow[];
}

async function readProfiles(ids: string[], warnings: string[]) {
  if (!ids.length) return [] as ProfileRow[];
  const { data, error } = await logimailDb().from("profiles").select("id,email,full_name,account_status").in("id", ids);
  if (error) {
    if (isMissingLogimailSchema(error)) {
      warnings.push("Không đọc được LogiMail profiles.");
      return [];
    }
    throw error;
  }
  return (data ?? []) as ProfileRow[];
}

async function uniqueWorkspaceSlug(base: string) {
  const safeBase = slugBaseFromText(base);
  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? safeBase : `${safeBase}-${index + 1}`.slice(0, 63);
    const { data, error } = await logimailDb().from("workspaces").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${safeBase.slice(0, 54)}-${Date.now().toString(36)}`;
}

function mapAccountRequest(row: AccountRequestRow): LogimailApprovalRequestView {
  const workspaceName = row.requested_workspace_name || row.company_name || `LogiMail ${row.email}`;
  return {
    id: row.id,
    type: "account",
    status: row.status,
    title: `Tài khoản ${row.email}`,
    detail: workspaceName,
    secondary: row.purpose,
    requesterUserId: row.user_id,
    requesterEmail: row.email,
    workspaceId: null,
    workspaceName,
    workspaceSlug: row.requested_slug,
    targetValue: row.email,
    riskFlags: [],
    plannedRecordCount: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDomainRequest(row: DomainRequestRow, workspace?: WorkspaceRow, profile?: ProfileRow): LogimailApprovalRequestView {
  const plannedRecords = plannedRecordCount(row.dns_plan);
  const riskFlags = Array.isArray(row.risk_flags) ? row.risk_flags.map(String) : [];
  return {
    id: row.id,
    type: "domain",
    status: row.status,
    title: row.domain,
    detail: `MX host ${row.mail_hostname}`,
    secondary: row.purpose,
    requesterUserId: row.requested_by,
    requesterEmail: profile?.email ?? null,
    workspaceId: row.workspace_id,
    workspaceName: workspace?.name ?? null,
    workspaceSlug: workspace?.slug ?? null,
    targetValue: row.domain,
    riskFlags,
    plannedRecordCount: plannedRecords,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMailboxRequest(row: MailboxRequestRow, workspace?: WorkspaceRow, domain?: DomainRow, profile?: ProfileRow): LogimailApprovalRequestView {
  return {
    id: row.id,
    type: "mailbox",
    status: row.status,
    title: row.email_address,
    detail: row.display_name || `${row.quota_mb}MB`,
    secondary: domain ? `${domain.domain} · ${domain.status}/${domain.approval_status}` : null,
    requesterUserId: row.requested_by,
    requesterEmail: profile?.email ?? null,
    workspaceId: row.workspace_id,
    workspaceName: workspace?.name ?? null,
    workspaceSlug: workspace?.slug ?? null,
    targetValue: row.email_address,
    riskFlags: domain && (domain.status !== "active" || domain.approval_status !== "approved") ? ["domain_not_active"] : [],
    plannedRecordCount: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function emptyDomainControl(warnings: string[] = []): LogimailDomainControl {
  return {
    schemaReady: false,
    generatedAt: new Date().toISOString(),
    summary: { total: 0, active: 0, registrationEnabled: 0, warning: 0, cloudflareReady: false },
    workspaces: [],
    domains: [],
    warnings
  };
}

async function readMailboxCounts(domainIds: string[], warnings: string[]) {
  const counts = new Map<string, number>();
  if (!domainIds.length) return counts;
  const { data, error } = await logimailDb().from("mailboxes").select("domain_id").in("domain_id", domainIds).limit(5000);
  if (error) {
    if (isMissingLogimailSchema(error)) {
      warnings.push("Không đọc được số mailbox theo domain.");
      return counts;
    }
    throw error;
  }
  for (const row of (data ?? []) as Array<{ domain_id: string }>) {
    counts.set(row.domain_id, (counts.get(row.domain_id) ?? 0) + 1);
  }
  return counts;
}

function mapDomainControlRow(domain: DomainRow, workspace?: { id: string; name: string; slug: string; status: string }, mailboxCount = 0): LogimailDomainView {
  const mailHostname = domain.mail_hostname || process.env.LOGIMAIL_MAIL_HOSTNAME || "mail.logivn.com";
  return {
    id: domain.id,
    workspaceId: domain.workspace_id,
    workspaceName: workspace?.name ?? null,
    workspaceSlug: workspace?.slug ?? null,
    domain: domain.domain,
    mailHostname,
    status: domain.status,
    approvalStatus: domain.approval_status,
    registrationEnabled: domain.registration_enabled,
    dns: {
      mx: domain.mx_status ?? "unknown",
      spf: domain.spf_status ?? "unknown",
      dkim: domain.dkim_status ?? "unknown",
      dmarc: domain.dmarc_status ?? "unknown",
      ptr: domain.ptr_status ?? "unknown",
      lastCheckedAt: domain.last_checked_at ?? null
    },
    mailboxCount,
    plannedRecords: plannedDomainDnsRecords(domain.domain, mailHostname),
    createdAt: domain.created_at ?? new Date(0).toISOString(),
    updatedAt: domain.updated_at ?? domain.created_at ?? new Date(0).toISOString()
  };
}

function plannedDomainDnsRecords(domain: string, mailHostname: string): LogimailDnsRecordView[] {
  const vpsIp = process.env.LOGIMAIL_VPS_IP || "103.199.19.144";
  return [
    { type: "A", name: mailHostname, content: vpsIp, proxied: false },
    { type: "MX", name: domain, content: mailHostname, priority: 10 },
    { type: "TXT", name: domain, content: `v=spf1 mx ip4:${vpsIp} ~all` },
    { type: "TXT", name: `_dmarc.${domain}`, content: `v=DMARC1; p=none; rua=mailto:postmaster@${domain}` }
  ];
}

async function getWorkspaceById(workspaceId: string) {
  const { data, error } = await logimailDb().from("workspaces").select("id,name,slug,status").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Không tìm thấy LogiMail workspace.", 404);
  return data as WorkspaceRow & { status: string };
}

async function getDefaultLogimailWorkspace() {
  const preferred = await logimailDb().from("workspaces").select("id,name,slug,status").eq("slug", "logimail-internal").maybeSingle();
  if (preferred.error) throw preferred.error;
  if (preferred.data) return preferred.data as WorkspaceRow & { status: string };

  const { data, error } = await logimailDb().from("workspaces").select("id,name,slug,status").eq("status", "active").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Chưa có LogiMail workspace active để gắn domain.", 409);
  return data as WorkspaceRow & { status: string };
}

function normalizeLogimailDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) throw new AppError("Domain email không hợp lệ.", 400);
  return domain;
}

function normalizeDomainStatus(value: string) {
  if (["pending", "active", "warning", "failed", "disabled"].includes(value)) return value;
  throw new AppError("Trạng thái domain không hợp lệ.", 400);
}

async function countDomainMailboxes(domainId: string) {
  const { count, error } = await logimailDb().from("mailboxes").select("id", { count: "exact", head: true }).eq("domain_id", domainId);
  if (error) throw error;
  return count ?? 0;
}

async function resolveDomainDnsStatus(domain: string, mailHostname: string) {
  const vpsIp = process.env.LOGIMAIL_VPS_IP || "103.199.19.144";
  const dkimSelectors = (process.env.LOGIMAIL_DKIM_SELECTORS || "default,mail,logimail,billionmail")
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean);
  const [aRecords, mxRecords, txtRecords, dmarcRecords, ptrRecords, dkimRecordSets] = await Promise.all([
    safeDns(() => resolve4(mailHostname)),
    safeDns(() => resolveMx(domain)),
    safeDns(() => resolveTxt(domain)),
    safeDns(() => resolveTxt(`_dmarc.${domain}`)),
    safeDns(() => reverse(vpsIp)),
    Promise.all(dkimSelectors.map((selector) => safeDns(() => resolveTxt(`${selector}._domainkey.${domain}`))))
  ]);
  const expectedMailHost = hostWithoutDot(mailHostname);
  const mx = mxRecords.some((record) => hostWithoutDot(record.exchange) === expectedMailHost) ? "pass" : "fail";
  const spfTexts = txtRecords.map((record) => record.join(""));
  const spf = spfTexts.some((text) => text.toLowerCase().startsWith("v=spf1") && (text.includes(vpsIp) || /(^|\s)mx(\s|$)/i.test(text))) ? "pass" : "fail";
  const dkim = dkimRecordSets.flat().map((record) => record.join("")).some((text) => text.toLowerCase().startsWith("v=dkim1") && /\bp=/.test(text)) ? "pass" : "warning";
  const dmarc = dmarcRecords.map((record) => record.join("")).some((text) => text.toLowerCase().startsWith("v=dmarc1")) ? "pass" : "warning";
  const ptr = ptrRecords.some((record) => hostWithoutDot(record) === expectedMailHost) ? "pass" : "warning";
  const a = aRecords.includes(vpsIp) ? "pass" : "warning";
  return { a, mx, spf, dkim, dmarc, ptr };
}

async function safeDns<T>(reader: () => Promise<T[]>) {
  try {
    return await reader();
  } catch {
    return [] as T[];
  }
}

function hostWithoutDot(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

async function writeLogimailAudit(input: { workspaceId?: string | null; actor: string; action: string; targetType: string; targetId: string; metadata?: Record<string, unknown> }) {
  const { error } = await logimailDb().from("audit_logs").insert({
    workspace_id: input.workspaceId ?? null,
    actor_id: null,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    metadata: { ...(input.metadata ?? {}), actor: input.actor, source: "admin.logivn.com" }
  });
  if (error && !isMissingLogimailSchema(error)) throw error;
}

async function writePlatformAuditLog(input: { actor: string; action: string; targetType: string; targetId?: string | null; metadata?: Record<string, unknown> }) {
  const { error } = await publicDb().from("platform_audit_logs").insert({
    actor: input.actor,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {}
  });
  if (error && !isMissingLogimailSchema(error)) throw error;
}

function logimailDb() {
  const client = createAdminSupabaseClient() as any;
  return typeof client.schema === "function" ? client.schema("logimail") : client;
}

function publicDb() {
  return createAdminSupabaseClient() as any;
}

function requestTable(type: LogimailApprovalRequestType) {
  if (type === "account") return "account_requests";
  if (type === "domain") return "domain_requests";
  return "mailbox_requests";
}

function emptyQueue(warnings: string[], securityCodes = emptySecurityCodeCenter()): LogimailApprovalQueue {
  return {
    schemaReady: false,
    generatedAt: new Date().toISOString(),
    summary: { pendingTotal: 0, accounts: 0, domains: 0, mailboxes: 0, risk: "blocked" },
    requests: [],
    securityCodes,
    domainControl: emptyDomainControl(),
    warnings
  };
}

function throwOnError(result: { error: unknown }) {
  if (result.error) throw result.error;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(row: unknown, key: string) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function plannedRecordCount(value: unknown) {
  const record = asRecord(value);
  return Array.isArray(record.plannedRecords) ? record.plannedRecords.length : 0;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "LogiMail provisioning failed.";
  return message.slice(0, 500);
}

function slugBaseFromText(value: string) {
  const ascii = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55);
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length >= 3 ? slug : `logimail-${Date.now().toString(36)}`;
}

function isMissingLogimailSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST202" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    /logimail|account_requests|domain_requests|mailbox_requests|Could not find|does not exist/i.test(message)
  );
}
