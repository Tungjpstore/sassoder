import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { readEnv, requiredEnv } from "../shared/env.js";
import { supabaseAdmin } from "../shared/supabase.js";
import { assertSignedToken, createSignedToken, tokenHash } from "../telegram-bot/crypto.mjs";
import type { PlatformTelegramConnection, PlatformTelegramRole } from "./types.mjs";

type TelegramIdentity = {
  telegramUserId: number;
  chatId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type PlatformSessionInput = {
  connection: PlatformTelegramConnection;
  action: string;
  payload?: Record<string, unknown>;
  ttlSeconds?: number;
};

type PlatformTelegramAuditEntry = {
  action: string;
  outcome: string;
  targetType: string;
  createdAt: string;
};

type PlatformAdminRole = "owner" | "ops" | "billing" | "content" | "support" | "readonly";

export type PlatformSubscriptionPayment = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  planName: string;
  planCode: string;
  amount: number;
  months: number;
  transferContent: string;
  createdAt: string;
  billingAction: string | null;
  effectiveSummary: string | null;
  effectiveAt: string | null;
  subscriptionStatus: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
};

export type PlatformTenantAction = {
  id: string;
  name: string;
  slug: string;
  platformStatus: "active" | "suspended" | "deleted";
  subscriptionStatus: string | null;
  planName: string;
  planCode: string;
  riskFlags: string[];
  createdAt: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  subscriptionCreatedAt: string | null;
  suspendedReason: string | null;
  deletedAt: string | null;
};

export type PlatformLogimailRequestType = "account" | "domain" | "mailbox";

export type PlatformLogimailRequest = {
  id: string;
  type: PlatformLogimailRequestType;
  title: string;
  detail: string;
  requesterUserId: string;
  requesterEmail: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceSlug: string | null;
  targetValue: string;
  purpose: string | null;
  riskFlags: string[];
  plannedRecordCount: number;
  createdAt: string;
};

export type PlatformLogimailSecurityCode = {
  id: string;
  domain: string | null;
  purpose: "account_access" | "account_signup" | "password_reset";
  code: string | null;
  codeHint: string;
  status: "active" | "used" | "expired" | "revoked";
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  consumedEmail: string | null;
};

export type PlatformLogimailDomain = {
  id: string;
  domain: string;
  mailHostname: string;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceSlug: string | null;
  status: string;
  approvalStatus: string;
  registrationEnabled: boolean;
  mailboxCount: number;
  dns: {
    mx: string;
    spf: string;
    dkim: string;
    dmarc: string;
    ptr: string;
    lastCheckedAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

type BackupJobStatus = "queued" | "running" | "success" | "warn" | "failed" | "cancelled";
type BackupRpoRisk = "low" | "medium" | "high";

type BackupJobRow = {
  id: string;
  environment: string;
  backup_type: string;
  retention_class: string;
  status: BackupJobStatus;
  trigger_source: string;
  triggered_by: string | null;
  storage_provider: string;
  storage_bucket: string | null;
  storage_prefix: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  file_size: number | null;
  artifact_count: number | null;
  encrypted: boolean;
  checksum_status: string;
  verify_status: string;
  retention_applied: boolean;
  error_step: string | null;
  error_message: string | null;
  summary: unknown;
  metadata: unknown;
  created_at: string;
};

type BackupArtifactRow = {
  id: string;
  job_id: string;
  artifact_type: string;
  status: string;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  encrypted: boolean;
  created_at: string;
};

type BackupRestoreTestRow = {
  id: string;
  job_id: string | null;
  environment: string;
  status: string;
  schema_verified: boolean;
  row_count_verified: boolean;
  critical_tables_verified: boolean;
  error_message: string | null;
  verification_summary: unknown;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type BackupAlertRow = {
  id: string;
  job_id: string | null;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved";
  title: string;
  message: string;
  rpo_risk: BackupRpoRisk;
  created_at: string;
};

export type PlatformBackupSnapshot = {
  schemaReady: boolean;
  generatedAt: string;
  environment: string;
  latestJob: ReturnType<typeof mapBackupJob> | null;
  lastSuccessfulJob: ReturnType<typeof mapBackupJob> | null;
  artifacts: ReturnType<typeof mapBackupArtifact>[];
  restoreTest: ReturnType<typeof mapBackupRestoreTest> | null;
  openAlerts: ReturnType<typeof mapBackupAlert>[];
  queuedManualCount: number;
  ageHours: number | null;
  rpoRisk: BackupRpoRisk;
  warnings: string[];
};

export type PlatformBackupQueuedJob = {
  id: string;
  environment: string;
  retentionClass: string;
  status: BackupJobStatus;
  createdAt: string;
};

type LegacySubscriptionStatus = "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";

type LegacyPlanSnapshot = {
  id: string;
  code: string;
  name: string;
  monthly_price: number;
};

type LegacySubscriptionSnapshot = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: LegacySubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_started_at?: string | null;
  trial_ends_at: string | null;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
};

type LegacyPaymentSnapshot = {
  id: string;
  restaurant_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  months: number;
  status: string;
  transfer_content: string;
  amount?: number;
  confirmed_at?: string | null;
};

const PLATFORM_PAYMENT_SELECT = "id,restaurant_id,subscription_id,plan_id,amount,months,transfer_content,raw_data,created_at,restaurant:restaurants(name,slug),plan:saas_plans(name,code,monthly_price),subscription:restaurant_subscriptions(status,current_period_start,current_period_end,trial_ends_at,created_at)";
const PLATFORM_RESTAURANT_SELECT = "id,name,slug,platform_status,suspended_reason,deleted_at,created_at";
const PLATFORM_SUBSCRIPTION_SELECT = "id,restaurant_id,plan_id,status,current_period_start,current_period_end,trial_ends_at,created_at,plan:saas_plans(name,code,monthly_price)";
const PLATFORM_CONNECTION_SELECT = "id,telegram_user_id,telegram_chat_id,telegram_username,display_name,role,scopes,status,metadata";

export async function getPlatformConnectionForTelegramUser(telegramUserId: number) {
  const { data, error } = await db()
    .from("platform_telegram_connections")
    .select(PLATFORM_CONNECTION_SELECT)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return refreshPlatformConnectionAccess(normalizeConnection(data));
}

export async function getPlatformAlertRecipients(requiredScope = "incidents.read") {
  const { data, error } = await db()
    .from("platform_telegram_connections")
    .select(PLATFORM_CONNECTION_SELECT)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(25);
  if (isMissingPlatformTelegramSchema(error)) return [];
  if (error) throw error;
  const refreshed = await refreshPlatformConnectionsAccess((data ?? []).map(normalizeConnection));
  return refreshed.filter((connection: PlatformTelegramConnection) => hasPlatformScope(connection, requiredScope));
}

export async function getPlatformBackupSnapshot(): Promise<PlatformBackupSnapshot> {
  const environment = await resolveBackupEnvironment(readEnv("BACKUP_ENVIRONMENT") || readEnv("LOGIVN_ENV") || "prod");
  const jobSelect = "id,environment,backup_type,retention_class,status,trigger_source,triggered_by,storage_provider,storage_bucket,storage_prefix,started_at,finished_at,duration_ms,file_size,artifact_count,encrypted,checksum_status,verify_status,retention_applied,error_step,error_message,summary,metadata,created_at";
  const [jobsResult, latestSuccessResult, restoreTestResult, alertsResult, queuedManualResult] = await Promise.all([
    db()
      .from("backup_jobs")
      .select(jobSelect)
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(20),
    db()
      .from("backup_jobs")
      .select(jobSelect)
      .eq("environment", environment)
      .in("status", ["success", "warn"])
      .order("finished_at", { ascending: false })
      .limit(20),
    db()
      .from("backup_restore_tests")
      .select("id,job_id,environment,status,schema_verified,row_count_verified,critical_tables_verified,error_message,verification_summary,started_at,finished_at,created_at")
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from("backup_alerts")
      .select("id,job_id,severity,status,title,message,rpo_risk,created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(3),
    db()
      .from("backup_jobs")
      .select("id", { count: "exact", head: true })
      .eq("environment", environment)
      .eq("status", "queued")
      .eq("trigger_source", "manual")
  ]);

  const schemaError = [jobsResult.error, latestSuccessResult.error, restoreTestResult.error, alertsResult.error, queuedManualResult.error]
    .find(isMissingBackupSchema);
  if (schemaError) return emptyPlatformBackupSnapshot(environment);

  const hardError = jobsResult.error || latestSuccessResult.error || restoreTestResult.error || alertsResult.error || queuedManualResult.error;
  if (hardError) throw hardError;

  const latestJobs = ((jobsResult.data ?? []) as BackupJobRow[]).map(mapBackupJob).filter(isBackupDataJob);
  const latestJob = latestJobs[0] ?? null;
  const lastSuccessfulJob = ((latestSuccessResult.data ?? []) as BackupJobRow[])
    .map(mapBackupJob)
    .find(isCompletedDataBackupJob) ?? null;
  const artifacts = await getBackupArtifactsForJob(lastSuccessfulJob?.id ?? latestJob?.id ?? null);
  const openAlerts = ((alertsResult.data ?? []) as BackupAlertRow[]).map(mapBackupAlert);
  const ageHours = backupHoursSince(lastSuccessfulJob?.finishedAt ?? lastSuccessfulJob?.startedAt);

  return {
    schemaReady: true,
    generatedAt: new Date().toISOString(),
    environment,
    latestJob,
    lastSuccessfulJob,
    artifacts,
    restoreTest: restoreTestResult.data ? mapBackupRestoreTest(restoreTestResult.data as BackupRestoreTestRow) : null,
    openAlerts,
    queuedManualCount: Number(queuedManualResult.count ?? 0),
    ageHours,
    rpoRisk: platformBackupRpoRisk({
      ageHours,
      latestStatus: latestJob?.status,
      openCriticalAlerts: openAlerts.filter((alert) => alert.severity === "critical").length
    }),
    warnings: []
  };
}

export async function queuePlatformManualBackup(input: { actor: string; reason?: string | null }): Promise<PlatformBackupQueuedJob> {
  const environment = await resolveBackupEnvironment(readEnv("BACKUP_ENVIRONMENT") || readEnv("LOGIVN_ENV") || "prod");
  const reason = input.reason?.trim() || "manual backup requested from Dev Telegram bot";
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("backup_jobs")
    .insert({
      environment,
      backup_type: "full",
      retention_class: "manual",
      status: "queued",
      trigger_source: "manual",
      triggered_by: input.actor,
      storage_provider: "cloudflare-r2",
      storage_bucket: readEnv("R2_BUCKET", "logivn-backups"),
      storage_prefix: `${readEnv("BACKUP_R2_PREFIX", "logivn")}/${environment}`,
      encrypted: true,
      checksum_status: "pending",
      verify_status: "pending",
      summary: { reason },
      metadata: {
        source: "platform-telegram-bot",
        queuedAt: now,
        executor: "infra/vps/scripts/backup.sh --claim-manual"
      }
    })
    .select("id,environment,retention_class,status,created_at")
    .maybeSingle();
  if (isMissingBackupSchema(error)) throw new Error("backup_schema_missing");
  if (error) throw error;
  if (!data) throw new Error("backup_manual_queue_failed");

  await db().from("backup_events").insert({
    job_id: data.id,
    event_type: "manual_backup_queued",
    severity: "info",
    step: "telegram_manual_trigger",
    message: reason,
    metadata: { actor: input.actor, source: "platform-telegram-bot" }
  }).then(({ error }: { error: { code?: string; message?: string } | null }) => {
    if (error && !isMissingBackupSchema(error)) throw error;
  });

  return {
    id: String(data.id),
    environment: String(data.environment),
    retentionClass: String(data.retention_class),
    status: data.status as BackupJobStatus,
    createdAt: String(data.created_at)
  };
}

export async function claimPlatformConnectionToken(token: string, identity: TelegramIdentity) {
  assertSignedToken(token, connectTokenSecret());
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("platform_telegram_connection_tokens")
    .update({
      consumed_at: now,
      consumed_by_telegram_user_id: identity.telegramUserId
    })
    .eq("token_hash", tokenHash(token))
    .is("consumed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id,platform_admin_user_id,platform_admin_session_id,actor,admin_role,telegram_role,scopes,expires_at")
    .maybeSingle();

  if (isMissingPlatformTelegramSchema(error)) throw new Error("platform_connect_token_schema_missing");
  if (error) throw error;
  if (!data) {
    await recordPlatformTelegramAudit({
      telegramUserId: identity.telegramUserId,
      action: "platform.telegram.connect_token.claim",
      outcome: "denied",
      metadata: { reason: "invalid_expired_or_consumed" }
    });
    throw new Error("platform_connect_token_invalid");
  }

  const tokenAccess = await resolveCurrentPlatformTokenAccess(data as Record<string, unknown>);
  const connection = await connectPlatformTelegramAccount(identity, {
    role: tokenAccess.telegramRole,
    scopes: tokenAccess.scopes,
    metadata: {
      source: "platform_admin_connect_link",
      tokenId: String(data.id),
      actor: String(data.actor),
      adminRole: String(data.admin_role),
      platformAdminUserId: data.platform_admin_user_id ? String(data.platform_admin_user_id) : null,
      platformAdminSessionId: data.platform_admin_session_id ? String(data.platform_admin_session_id) : null
    }
  });

  await recordPlatformTelegramAudit({
    connection,
    action: "platform.telegram.connect_token.claim",
    outcome: "accepted",
    targetType: "platform_telegram_connection_token",
    targetId: String(data.id),
    metadata: { actor: String(data.actor), adminRole: String(data.admin_role), expiresAt: String(data.expires_at) }
  });

  return connection;
}

export async function connectPlatformTelegramAccount(
  identity: TelegramIdentity,
  input: { role?: PlatformTelegramRole; scopes?: string[]; metadata?: Record<string, unknown> } = {}
) {
  const role = input.role ?? "ADMIN";
  const scopes = input.scopes?.length ? input.scopes : defaultScopes(role);
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("platform_telegram_connections")
    .upsert(
      {
        telegram_user_id: identity.telegramUserId,
        telegram_chat_id: identity.chatId,
        telegram_username: identity.username ?? null,
        telegram_first_name: identity.firstName ?? null,
        telegram_last_name: identity.lastName ?? null,
        display_name: [identity.firstName, identity.lastName].filter(Boolean).join(" ") || identity.username || `dev-${identity.telegramUserId}`,
        role,
        scopes,
        status: "active",
        connected_at: now,
        last_seen_at: now,
        revoked_at: null,
        metadata: input.metadata ?? { source: "platform_telegram_bootstrap" }
      },
      { onConflict: "telegram_user_id" }
    )
    .select(PLATFORM_CONNECTION_SELECT)
    .single();
  if (error) throw error;
  const connection = normalizeConnection(data);
  await recordPlatformTelegramAudit({ connection, action: "platform.telegram.connect", outcome: "accepted" });
  return connection;
}

export async function touchPlatformConnection(connection: PlatformTelegramConnection) {
  const { error } = await db()
    .from("platform_telegram_connections")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", connection.id)
    .eq("status", "active");
  if (error) throw error;
}

export async function revokePlatformConnectionById(connection: PlatformTelegramConnection, reason = "telegram_self_disconnect") {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("platform_telegram_connections")
    .update({
      status: "revoked",
      revoked_at: now,
      metadata: { revokedBy: "telegram", revokedReason: reason, revokedFrom: "platform_devops_bot" }
    })
    .eq("id", connection.id)
    .eq("telegram_user_id", connection.telegram_user_id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("platform_connection_revoke_failed");
  await recordPlatformTelegramAudit({
    connection,
    action: "platform.telegram.connection.self_revoked",
    outcome: "accepted",
    targetType: "platform_telegram_connection",
    targetId: connection.id,
    metadata: { reason, revokedAt: now }
  });
}

export async function getPlatformConnectionRecentAudit(connection: PlatformTelegramConnection, limit = 5): Promise<PlatformTelegramAuditEntry[]> {
  const { data, error } = await db()
    .from("platform_telegram_audit_logs")
    .select("action,outcome,target_type,created_at")
    .or(`connection_id.eq.${connection.id},telegram_user_id.eq.${connection.telegram_user_id}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (isMissingPlatformTelegramSchema(error)) return [];
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    action: String(row.action ?? "platform.telegram.unknown"),
    outcome: String(row.outcome ?? "unknown"),
    targetType: row.target_type ? String(row.target_type) : "system",
    createdAt: String(row.created_at)
  }));
}

export async function listPendingSubscriptionPayments(limit = 5): Promise<PlatformSubscriptionPayment[]> {
  const { data, error } = await db()
    .from("subscription_payment_logs")
    .select(PLATFORM_PAYMENT_SELECT)
    .eq("status", "waiting_confirm")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (isMissingOperationalSchema(error)) return [];
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => normalizePlatformSubscriptionPayment(row));
}

export async function getPendingSubscriptionPayment(paymentId: string): Promise<PlatformSubscriptionPayment | null> {
  const { data, error } = await db()
    .from("subscription_payment_logs")
    .select(PLATFORM_PAYMENT_SELECT)
    .eq("id", paymentId)
    .eq("status", "waiting_confirm")
    .maybeSingle();
  if (isMissingOperationalSchema(error)) return null;
  if (error) throw error;
  return data ? normalizePlatformSubscriptionPayment(data as Record<string, unknown>) : null;
}

export async function listPendingLogimailRequests(limit = 6): Promise<PlatformLogimailRequest[]> {
  const [accountsResult, domainsResult, mailboxesResult] = await Promise.all([
    logimailDb().from("account_requests").select("id,user_id,email,full_name,company_name,purpose,requested_workspace_name,requested_slug,status,created_at,updated_at").eq("status", "pending").order("created_at", { ascending: true }).limit(limit),
    logimailDb().from("domain_requests").select("id,workspace_id,requested_by,domain,mail_hostname,purpose,dns_plan,risk_flags,status,created_at,updated_at").eq("status", "pending").order("created_at", { ascending: true }).limit(limit),
    logimailDb().from("mailbox_requests").select("id,workspace_id,domain_id,requested_by,local_part,email_address,display_name,quota_mb,status,created_at,updated_at").eq("status", "pending").order("created_at", { ascending: true }).limit(limit)
  ]);
  if (isMissingLogimailSchema(accountsResult.error) || isMissingLogimailSchema(domainsResult.error) || isMissingLogimailSchema(mailboxesResult.error)) return [];
  if (accountsResult.error) throw accountsResult.error;
  if (domainsResult.error) throw domainsResult.error;
  if (mailboxesResult.error) throw mailboxesResult.error;

  const accounts = (accountsResult.data ?? []) as Record<string, unknown>[];
  const domains = (domainsResult.data ?? []) as Record<string, unknown>[];
  const mailboxes = (mailboxesResult.data ?? []) as Record<string, unknown>[];
  const requesterIds = uniqueStrings([...accounts.map((row) => row.user_id), ...domains.map((row) => row.requested_by), ...mailboxes.map((row) => row.requested_by)]);
  const workspaceIds = uniqueStrings([...domains.map((row) => row.workspace_id), ...mailboxes.map((row) => row.workspace_id)]);
  const domainIds = uniqueStrings(mailboxes.map((row) => row.domain_id));
  const [profiles, workspaces, mailboxDomains] = await Promise.all([
    readLogimailProfiles(requesterIds),
    readLogimailWorkspaces(workspaceIds),
    readLogimailDomains(domainIds)
  ]);
  const profileById = new Map(profiles.map((row) => [String(row.id), row]));
  const workspaceById = new Map(workspaces.map((row) => [String(row.id), row]));
  const domainById = new Map(mailboxDomains.map((row) => [String(row.id), row]));

  return [
    ...accounts.map((row) => normalizeLogimailAccountRequest(row)),
    ...domains.map((row) => normalizeLogimailDomainRequest(row, workspaceById.get(String(row.workspace_id)), profileById.get(String(row.requested_by)))),
    ...mailboxes.map((row) => normalizeLogimailMailboxRequest(row, workspaceById.get(String(row.workspace_id)), domainById.get(String(row.domain_id)), profileById.get(String(row.requested_by))))
  ]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .slice(0, limit);
}

export async function getPendingLogimailRequest(type: PlatformLogimailRequestType, requestId: string): Promise<PlatformLogimailRequest | null> {
  const row = await readRawPendingLogimailRequest(type, requestId);
  if (!row) return null;

  if (type === "account") return normalizeLogimailAccountRequest(row);
  if (type === "domain") {
    const [workspace, profile] = await Promise.all([
      readLogimailWorkspace(String(row.workspace_id)),
      readLogimailProfile(String(row.requested_by))
    ]);
    return normalizeLogimailDomainRequest(row, workspace ?? undefined, profile ?? undefined);
  }

  const [workspace, domain, profile] = await Promise.all([
    readLogimailWorkspace(String(row.workspace_id)),
    readLogimailDomain(String(row.domain_id)),
    readLogimailProfile(String(row.requested_by))
  ]);
  return normalizeLogimailMailboxRequest(row, workspace ?? undefined, domain ?? undefined, profile ?? undefined);
}

export async function listActiveLogimailSecurityCodes(limit = 8): Promise<PlatformLogimailSecurityCode[]> {
  await runLogimailSecurityCodeMaintenance("platform_devops_bot:auto");
  const { data, error } = await logimailDb()
    .from("security_codes")
    .select("id,domain,purpose,code_hash,code_ciphertext,code_hint,status,max_uses,used_count,expires_at,created_by,consumed_email,consumed_at,replaced_by,metadata,created_at")
    .eq("status", "active")
    .eq("purpose", "account_signup")
    .order("expires_at", { ascending: true })
    .limit(limit);
  if (isMissingLogimailSchema(error)) return [];
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => normalizeLogimailSecurityCode(row));
}

export async function listLogimailDomainsForTelegram(limit = 8): Promise<PlatformLogimailDomain[]> {
  const { data, error } = await logimailDb()
    .from("domains")
    .select("id,workspace_id,domain,mail_hostname,status,approval_status,registration_enabled,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at,created_at,updated_at")
    .order("domain", { ascending: true })
    .limit(limit);
  if (isMissingLogimailSchema(error)) return [];
  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  const workspaceIds = uniqueStrings(rows.map((row) => row.workspace_id));
  const [workspaces, mailboxCounts] = await Promise.all([
    readLogimailWorkspaces(workspaceIds),
    readLogimailMailboxCounts(rows.map((row) => String(row.id)))
  ]);
  const workspaceById = new Map(workspaces.map((workspace) => [String(workspace.id), workspace]));

  return rows.map((row) => normalizeLogimailDomainForTelegram(row, workspaceById.get(String(row.workspace_id)), mailboxCounts.get(String(row.id)) ?? 0));
}

export async function createLogimailSecurityCodeFromTelegram(actor: string) {
  const created = await createLogimailSecurityCode({
    domain: await defaultLogimailSecurityCodeDomain(),
    purpose: "account_signup",
    actor,
    metadata: { source: "platform_devops_bot" }
  });
  await writePlatformAuditLog({ actor, action: "logimail_security_code_created_telegram", targetType: "logimail_security_code", targetId: String(created.row.id), metadata: { domain: created.row.domain, purpose: created.row.purpose, expiresAt: created.row.expires_at } });
  return { codeId: String(created.row.id), code: created.code, domain: created.row.domain, expiresAt: created.row.expires_at };
}

export async function rotateLogimailSecurityCodeFromTelegram(codeId: string, actor: string) {
  const current = await readLogimailSecurityCode(codeId);
  if (!current) throw new Error("logimail_security_code_not_found");
  if (String(current.status) === "active") {
    const { data, error } = await logimailDb()
      .from("security_codes")
      .update({ status: "revoked", revoked_by: actor, revoked_at: new Date().toISOString(), metadata: { ...asRecord(current.metadata), revokedReason: "telegram_rotate" } })
      .eq("id", codeId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("logimail_security_code_not_active");
  }
  const created = await createLogimailSecurityCode({
    domain: stringField(current, "domain"),
    purpose: securityCodePurpose(current.purpose),
    actor,
    metadata: { source: "platform_devops_bot", replacedFrom: codeId, replacementReason: "manual_rotate" }
  });
  await logimailDb().from("security_codes").update({ replaced_by: created.row.id }).eq("id", codeId).then(throwOnError);
  await writePlatformAuditLog({ actor, action: "logimail_security_code_rotated_telegram", targetType: "logimail_security_code", targetId: codeId, metadata: { replacementId: created.row.id, domain: created.row.domain } });
  return { codeId: String(created.row.id), code: created.code, domain: created.row.domain, expiresAt: created.row.expires_at };
}

export async function revokeLogimailSecurityCodeFromTelegram(codeId: string, actor: string) {
  const { data, error } = await logimailDb()
    .from("security_codes")
    .update({ status: "revoked", revoked_by: actor, revoked_at: new Date().toISOString(), metadata: { revokedBy: actor, revokedFrom: "platform_devops_bot" } })
    .eq("id", codeId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("logimail_security_code_not_active");
  await writePlatformAuditLog({ actor, action: "logimail_security_code_revoked_telegram", targetType: "logimail_security_code", targetId: codeId });
  return { codeId, status: "revoked" };
}

export async function approveLogimailRequestFromTelegram(type: PlatformLogimailRequestType, requestId: string, actor: string) {
  if (type === "account") return approveLogimailAccountRequest(requestId, actor);
  if (type === "domain") return approveLogimailDomainRequest(requestId, actor);
  return approveLogimailMailboxRequest(requestId, actor);
}

export async function rejectLogimailRequestFromTelegram(type: PlatformLogimailRequestType, requestId: string, actor: string, reason = "Từ chối từ LogiVN DevOps Bot") {
  const now = new Date().toISOString();
  const current = await getRawPendingLogimailRequest(type, requestId);
  const { data, error } = await logimailDb()
    .from(logimailRequestTable(type))
    .update({
      status: "rejected",
      reviewed_at: now,
      rejection_reason: reason,
      metadata: { ...asRecord(current.metadata), reviewedByActor: actor, reviewedFrom: "platform_devops_bot", rejectionReason: reason }
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("logimail_request_not_pending");

  await writeLogimailAudit({
    workspaceId: stringField(current, "workspace_id"),
    actor,
    action: `logimail.${type}_request_rejected_telegram`,
    targetType: `${type}_request`,
    targetId: requestId,
    metadata: { reason }
  });
  await writePlatformAuditLog({ actor, action: "logimail_request_rejected_telegram", targetType: "logimail_request", targetId: `${type}:${requestId}`, metadata: { requestType: type, reason } });
  return { requestId, requestType: type, status: "rejected" };
}

export async function listPlatformTenantActions(limit = 6): Promise<PlatformTenantAction[]> {
  const [restaurantsResult, subscriptionsResult] = await Promise.all([
    db()
      .from("restaurants")
      .select(PLATFORM_RESTAURANT_SELECT)
      .order("created_at", { ascending: false })
      .limit(60),
    db()
      .from("restaurant_subscriptions")
      .select(PLATFORM_SUBSCRIPTION_SELECT)
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  if (isMissingOperationalSchema(restaurantsResult.error) || isMissingOperationalSchema(subscriptionsResult.error)) return [];
  if (restaurantsResult.error) throw restaurantsResult.error;
  if (subscriptionsResult.error) throw subscriptionsResult.error;

  const subscriptionsByRestaurant = new Map<string, Record<string, unknown>>();
  for (const subscription of subscriptionsResult.data ?? []) {
    const restaurantId = String((subscription as Record<string, unknown>).restaurant_id ?? "");
    if (restaurantId && !subscriptionsByRestaurant.has(restaurantId)) subscriptionsByRestaurant.set(restaurantId, subscription as Record<string, unknown>);
  }

  return (restaurantsResult.data ?? [])
    .map((restaurant: Record<string, unknown>) => normalizePlatformTenantAction(restaurant, subscriptionsByRestaurant.get(String(restaurant.id))))
    .sort((a: PlatformTenantAction, b: PlatformTenantAction) => tenantPriority(b) - tenantPriority(a))
    .slice(0, limit);
}

export async function getPlatformTenantAction(restaurantId: string): Promise<PlatformTenantAction | null> {
  const [restaurantResult, subscriptionsResult] = await Promise.all([
    db().from("restaurants").select(PLATFORM_RESTAURANT_SELECT).eq("id", restaurantId).maybeSingle(),
    db().from("restaurant_subscriptions").select(PLATFORM_SUBSCRIPTION_SELECT).eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(1)
  ]);

  if (isMissingOperationalSchema(restaurantResult.error) || isMissingOperationalSchema(subscriptionsResult.error)) return null;
  if (restaurantResult.error) throw restaurantResult.error;
  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (!restaurantResult.data) return null;

  const subscription = firstOrNull((subscriptionsResult.data ?? []) as Record<string, unknown>[]);
  return normalizePlatformTenantAction(restaurantResult.data as Record<string, unknown>, subscription ?? undefined);
}

function normalizePlatformSubscriptionPayment(row: Record<string, unknown>): PlatformSubscriptionPayment {
  const restaurant = firstOrNull(row.restaurant as Record<string, unknown> | Record<string, unknown>[] | null | undefined);
  const plan = firstOrNull(row.plan as Record<string, unknown> | Record<string, unknown>[] | null | undefined);
  const subscription = firstOrNull(row.subscription as Record<string, unknown> | Record<string, unknown>[] | null | undefined);
  const rawData = asRecord(row.raw_data);

  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    restaurantName: stringField(restaurant, "name") ?? "Không rõ quán",
    restaurantSlug: stringField(restaurant, "slug") ?? "",
    planName: stringField(rawData, "planName") ?? stringField(plan, "name") ?? "Gói SaaS",
    planCode: stringField(rawData, "planCode") ?? stringField(plan, "code") ?? "",
    amount: Number(row.amount ?? 0),
    months: Number(row.months ?? 1),
    transferContent: String(row.transfer_content ?? ""),
    createdAt: String(row.created_at),
    billingAction: stringField(rawData, "billingAction"),
    effectiveSummary: stringField(rawData, "effectiveSummary"),
    effectiveAt: stringField(rawData, "effectiveAt"),
    subscriptionStatus: stringField(subscription, "status"),
    currentPeriodStart: stringField(subscription, "current_period_start"),
    currentPeriodEnd: stringField(subscription, "current_period_end"),
    trialEndsAt: stringField(subscription, "trial_ends_at")
  };
}

function normalizePlatformTenantAction(restaurant: Record<string, unknown>, subscription?: Record<string, unknown>): PlatformTenantAction {
  const plan = firstOrNull(subscription?.plan as Record<string, unknown> | Record<string, unknown>[] | null | undefined);
  const platformStatus = normalizePlatformStatus(restaurant.platform_status);
  const subscriptionStatus = stringField(subscription, "status");
  const trialEndsAt = stringField(subscription, "trial_ends_at");
  const riskFlags = [
    !subscription ? "chưa có gói" : null,
    subscriptionStatus === "pending_payment" || subscriptionStatus === "past_due" ? "cần thanh toán" : null,
    subscriptionStatus === "trialing" && daysUntil(trialEndsAt) <= 3 ? "trial sắp hết" : null,
    platformStatus === "suspended" ? "đang tạm dừng" : null,
    platformStatus === "deleted" ? "đã xóa mềm" : null
  ].filter(Boolean) as string[];

  return {
    id: String(restaurant.id),
    name: String(restaurant.name ?? "Không rõ quán"),
    slug: String(restaurant.slug ?? ""),
    platformStatus,
    subscriptionStatus,
    planName: stringField(plan, "name") ?? "Chưa có gói",
    planCode: stringField(plan, "code") ?? "",
    riskFlags,
    createdAt: String(restaurant.created_at),
    currentPeriodStart: stringField(subscription, "current_period_start"),
    currentPeriodEnd: stringField(subscription, "current_period_end"),
    trialEndsAt,
    subscriptionCreatedAt: stringField(subscription, "created_at"),
    suspendedReason: stringField(restaurant, "suspended_reason"),
    deletedAt: stringField(restaurant, "deleted_at")
  };
}

function normalizeLogimailAccountRequest(row: Record<string, unknown>): PlatformLogimailRequest {
  const email = String(row.email ?? "");
  const workspaceName = stringField(row, "requested_workspace_name") ?? stringField(row, "company_name") ?? `LogiMail ${email}`;
  return {
    id: String(row.id),
    type: "account",
    title: email,
    detail: workspaceName,
    requesterUserId: String(row.user_id),
    requesterEmail: email,
    workspaceId: null,
    workspaceName,
    workspaceSlug: stringField(row, "requested_slug"),
    targetValue: email,
    purpose: stringField(row, "purpose"),
    riskFlags: [],
    plannedRecordCount: 0,
    createdAt: String(row.created_at)
  };
}

function normalizeLogimailDomainRequest(row: Record<string, unknown>, workspace?: Record<string, unknown>, profile?: Record<string, unknown>): PlatformLogimailRequest {
  const dnsPlan = asRecord(row.dns_plan);
  return {
    id: String(row.id),
    type: "domain",
    title: String(row.domain ?? "domain"),
    detail: `MX host ${String(row.mail_hostname ?? "")}`,
    requesterUserId: String(row.requested_by),
    requesterEmail: stringField(profile, "email"),
    workspaceId: String(row.workspace_id),
    workspaceName: stringField(workspace, "name"),
    workspaceSlug: stringField(workspace, "slug"),
    targetValue: String(row.domain ?? ""),
    purpose: stringField(row, "purpose"),
    riskFlags: Array.isArray(row.risk_flags) ? row.risk_flags.map(String) : [],
    plannedRecordCount: Array.isArray(dnsPlan.plannedRecords) ? dnsPlan.plannedRecords.length : 0,
    createdAt: String(row.created_at)
  };
}

function normalizeLogimailMailboxRequest(row: Record<string, unknown>, workspace?: Record<string, unknown>, domain?: Record<string, unknown>, profile?: Record<string, unknown>): PlatformLogimailRequest {
  const riskFlags = domain && (domain.status !== "active" || domain.approval_status !== "approved") ? ["domain_not_active"] : [];
  return {
    id: String(row.id),
    type: "mailbox",
    title: String(row.email_address ?? "mailbox"),
    detail: stringField(row, "display_name") ?? `${Number(row.quota_mb ?? 0)}MB`,
    requesterUserId: String(row.requested_by),
    requesterEmail: stringField(profile, "email"),
    workspaceId: String(row.workspace_id),
    workspaceName: stringField(workspace, "name"),
    workspaceSlug: stringField(workspace, "slug"),
    targetValue: String(row.email_address ?? ""),
    purpose: domain ? `${String(domain.domain ?? "domain")} · ${String(domain.status ?? "unknown")}` : null,
    riskFlags,
    plannedRecordCount: 0,
    createdAt: String(row.created_at)
  };
}

function normalizeLogimailSecurityCode(row: Record<string, unknown>): PlatformLogimailSecurityCode {
  return {
    id: String(row.id),
    domain: stringField(row, "domain"),
    purpose: securityCodePurpose(row.purpose),
    code: decryptLogimailSecurityCode(stringField(row, "code_ciphertext")) ?? (stringField(row, "code_hint") ? `••••-${stringField(row, "code_hint")}` : null),
    codeHint: stringField(row, "code_hint") ?? "",
    status: securityCodeStatus(row.status),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    createdBy: stringField(row, "created_by"),
    consumedEmail: stringField(row, "consumed_email")
  };
}

function normalizeLogimailDomainForTelegram(row: Record<string, unknown>, workspace?: Record<string, unknown>, mailboxCount = 0): PlatformLogimailDomain {
  return {
    id: String(row.id),
    domain: String(row.domain ?? ""),
    mailHostname: stringField(row, "mail_hostname") ?? readEnv("LOGIMAIL_MAIL_HOSTNAME", "mail.logivn.com"),
    workspaceId: stringField(row, "workspace_id"),
    workspaceName: stringField(workspace, "name"),
    workspaceSlug: stringField(workspace, "slug"),
    status: String(row.status ?? "unknown"),
    approvalStatus: String(row.approval_status ?? "unknown"),
    registrationEnabled: Boolean(row.registration_enabled),
    mailboxCount,
    dns: {
      mx: String(row.mx_status ?? "unknown"),
      spf: String(row.spf_status ?? "unknown"),
      dkim: String(row.dkim_status ?? "unknown"),
      dmarc: String(row.dmarc_status ?? "unknown"),
      ptr: String(row.ptr_status ?? "unknown"),
      lastCheckedAt: stringField(row, "last_checked_at")
    },
    createdAt: String(row.created_at ?? new Date(0).toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date(0).toISOString())
  };
}

async function runLogimailSecurityCodeMaintenance(actor: string) {
  await revokeDeprecatedLogimailAccessCodes(actor);
  return rotateExpiredLogimailSecurityCodes(actor);
}

async function revokeDeprecatedLogimailAccessCodes(actor: string) {
  const { error } = await logimailDb()
    .from("security_codes")
    .update({ status: "revoked", revoked_by: actor, revoked_at: new Date().toISOString(), metadata: { revokedBy: actor, revokedReason: "deprecated_account_access" } })
    .eq("status", "active")
    .eq("purpose", "account_access");
  if (error && !isMissingLogimailSchema(error)) throw error;
}

async function rotateExpiredLogimailSecurityCodes(actor: string) {
  const { data, error } = await logimailDb()
    .from("security_codes")
    .select("id,domain,purpose,metadata")
    .eq("status", "active")
    .neq("purpose", "account_access")
    .lte("expires_at", new Date().toISOString())
    .limit(20);
  if (isMissingLogimailSchema(error)) return [];
  if (error) throw error;

  const created: Array<{ row: Record<string, unknown>; code: string }> = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const { data: expired, error: updateError } = await logimailDb()
      .from("security_codes")
      .update({ status: "expired", metadata: { ...asRecord(row.metadata), expiredBy: actor, expiredAt: new Date().toISOString() } })
      .eq("id", String(row.id))
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!expired) continue;
    const replacement = await createLogimailSecurityCode({
      domain: stringField(row, "domain"),
      purpose: securityCodePurpose(row.purpose),
      actor,
      metadata: { source: actor, replacedFrom: String(row.id), replacementReason: "expired" }
    });
    await logimailDb().from("security_codes").update({ replaced_by: replacement.row.id }).eq("id", String(row.id)).then(throwOnError);
    created.push(replacement);
  }
  return created;
}

async function createLogimailSecurityCode(input: { domain: string | null; purpose?: "account_access" | "account_signup" | "password_reset"; actor: string; ttlHours?: number; metadata?: Record<string, unknown> }) {
  const domain = input.domain ? normalizeLogimailDomain(input.domain) : null;
  const purpose = input.purpose ?? "account_signup";
  await revokeActiveSiblingLogimailSecurityCodes({ domain, purpose, actor: input.actor });
  const expiresAt = new Date(Date.now() + normalizeSecurityCodeTtl(input.ttlHours) * 60 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateLogimailSecurityCode();
    const { data, error } = await logimailDb()
      .from("security_codes")
      .insert({
        domain,
        purpose,
        code_hash: hashLogimailSecurityCode(code),
        code_ciphertext: encryptLogimailSecurityCode(code),
        code_hint: logimailSecurityCodeHint(code),
        status: "active",
        max_uses: 1,
        used_count: 0,
        expires_at: expiresAt,
        created_by: input.actor,
        metadata: input.metadata ?? {}
      })
      .select("id,domain,purpose,expires_at")
      .single();
    if (!error && data) return { row: data as Record<string, unknown>, code };
    if (error?.code !== "23505") throw error;
  }
  throw new Error("logimail_security_code_generation_failed");
}

async function revokeActiveSiblingLogimailSecurityCodes(input: { domain: string | null; purpose: "account_access" | "account_signup" | "password_reset"; actor: string }) {
  const query = logimailDb()
    .from("security_codes")
    .update({
      status: "revoked",
      revoked_by: input.actor,
      revoked_at: new Date().toISOString(),
      metadata: { revokedBy: input.actor, revokedReason: "replaced_by_new_active_code" }
    })
    .eq("status", "active")
    .eq("purpose", input.purpose);
  const { error } = input.domain ? await query.eq("domain", input.domain) : await query.is("domain", null);
  if (error && !isMissingLogimailSchema(error)) throw error;
}

async function readLogimailSecurityCode(codeId: string) {
  const { data, error } = await logimailDb().from("security_codes").select("*").eq("id", codeId).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function defaultLogimailSecurityCodeDomain() {
  const { data, error } = await logimailDb()
    .from("domains")
    .select("domain")
    .eq("status", "active")
    .eq("approval_status", "approved")
    .eq("registration_enabled", true)
    .order("domain")
    .limit(1)
    .maybeSingle();
  if (!error && data?.domain) return String(data.domain);
  return normalizeLogimailDomain(readEnv("LOGIMAIL_DOMAIN", "logivn.com"));
}

async function approveLogimailAccountRequest(requestId: string, actor: string) {
  const request = await getRawPendingLogimailRequest("account", requestId);
  const now = new Date().toISOString();
  const email = String(request.email ?? "").toLowerCase();
  const workspaceName = stringField(request, "requested_workspace_name") ?? stringField(request, "company_name") ?? `LogiMail ${email}`;
  const slug = await uniqueLogimailWorkspaceSlug(stringField(request, "requested_slug") ?? stringField(request, "company_name") ?? email);
  await claimLogimailApprovalRequest({ table: "account_requests", requestId, metadata: request.metadata, actor, now, extraMetadata: { plannedWorkspaceSlug: slug } });

  let workspace: Record<string, unknown>;
  try {
    await logimailDb().from("profiles").upsert({
      id: String(request.user_id),
      email,
      full_name: stringField(request, "full_name") ?? email,
      role: "owner",
      account_status: "approved",
      updated_at: now
    }, { onConflict: "id" }).then(throwOnError);

    const { data, error: workspaceError } = await logimailDb()
      .from("workspaces")
      .insert({ name: workspaceName, slug, owner_id: String(request.user_id), plan: "internal", status: "active" })
      .select("id,name,slug")
      .single();
    if (workspaceError) throw workspaceError;
    workspace = data as Record<string, unknown>;

    await logimailDb().from("workspace_members").upsert({ workspace_id: workspace.id, user_id: String(request.user_id), role: "owner" }, { onConflict: "workspace_id,user_id" }).then(throwOnError);
    await logimailDb().from("quotas").upsert({ workspace_id: workspace.id }, { onConflict: "workspace_id" }).then(throwOnError);
    await finalizeLogimailApprovalRequest({
      table: "account_requests",
      requestId,
      metadata: request.metadata,
      actor,
      extraMetadata: { provisionedWorkspaceId: workspace.id, provisionedWorkspaceSlug: workspace.slug }
    });
  } catch (error) {
    await markLogimailApprovalProvisioningFailed("account_requests", requestId, request.metadata, actor, error);
    throw error;
  }

  await writeLogimailAudit({ workspaceId: String(workspace.id), actor, action: "logimail.account_request_approved_telegram", targetType: "account_request", targetId: requestId, metadata: { email, workspaceId: workspace.id, workspaceSlug: workspace.slug } });
  await writePlatformAuditLog({ actor, action: "logimail_request_approved_telegram", targetType: "logimail_request", targetId: `account:${requestId}`, metadata: { requestType: "account", email, workspaceId: workspace.id } });
  return { requestId, requestType: "account", status: "approved", workspaceId: String(workspace.id), workspaceSlug: String(workspace.slug) };
}

async function approveLogimailDomainRequest(requestId: string, actor: string) {
  const request = await getRawPendingLogimailRequest("domain", requestId);
  const now = new Date().toISOString();
  await claimLogimailApprovalRequest({ table: "domain_requests", requestId, metadata: request.metadata, actor, now });

  let domain: Record<string, unknown>;
  try {
    const { data, error } = await logimailDb().from("domains").upsert({
      workspace_id: String(request.workspace_id),
      domain: String(request.domain),
      mail_hostname: String(request.mail_hostname),
      approval_status: "approved",
      registration_enabled: true,
      status: "active",
      updated_at: now
    }, { onConflict: "workspace_id,domain" }).select("id,domain").single();
    if (error) throw error;
    domain = data as Record<string, unknown>;

    await finalizeLogimailApprovalRequest({
      table: "domain_requests",
      requestId,
      metadata: request.metadata,
      actor,
      provisionedColumn: "provisioned_domain_id",
      provisionedId: String(domain.id),
      extraMetadata: { provisionedDomainId: domain.id }
    });
  } catch (error) {
    await markLogimailApprovalProvisioningFailed("domain_requests", requestId, request.metadata, actor, error);
    throw error;
  }

  await writeLogimailAudit({ workspaceId: String(request.workspace_id), actor, action: "logimail.domain_request_approved_telegram", targetType: "domain_request", targetId: requestId, metadata: { domain: request.domain, provisionedDomainId: domain.id } });
  await writePlatformAuditLog({ actor, action: "logimail_request_approved_telegram", targetType: "logimail_request", targetId: `domain:${requestId}`, metadata: { requestType: "domain", workspaceId: request.workspace_id, domain: request.domain, provisionedDomainId: domain.id } });
  return { requestId, requestType: "domain", status: "approved", domainId: String(domain.id) };
}

async function approveLogimailMailboxRequest(requestId: string, actor: string) {
  const request = await getRawPendingLogimailRequest("mailbox", requestId);
  const { data: domain, error: domainError } = await logimailDb().from("domains").select("id,workspace_id,status,approval_status").eq("id", String(request.domain_id)).maybeSingle();
  if (domainError) throw domainError;
  if (!domain || domain.workspace_id !== request.workspace_id || domain.status !== "active" || domain.approval_status !== "approved") throw new Error("logimail_domain_not_active");
  const now = new Date().toISOString();
  await claimLogimailApprovalRequest({ table: "mailbox_requests", requestId, metadata: request.metadata, actor, now });

  let mailbox: Record<string, unknown>;
  try {
    const { data, error } = await logimailDb().from("mailboxes").upsert({
      workspace_id: String(request.workspace_id),
      domain_id: String(request.domain_id),
      email_address: String(request.email_address),
      display_name: stringField(request, "display_name"),
      quota_mb: Number(request.quota_mb ?? 1024),
      status: "active",
      provider: "billionmail",
      updated_at: now
    }, { onConflict: "email_address" }).select("id,email_address").single();
    if (error) throw error;
    mailbox = data as Record<string, unknown>;

    await logimailDb().from("mailbox_permissions").upsert({ mailbox_id: mailbox.id, user_id: String(request.requested_by), permission: "admin" }, { onConflict: "mailbox_id,user_id" }).then(throwOnError);
    await finalizeLogimailApprovalRequest({
      table: "mailbox_requests",
      requestId,
      metadata: request.metadata,
      actor,
      provisionedColumn: "provisioned_mailbox_id",
      provisionedId: String(mailbox.id),
      extraMetadata: { provisionedMailboxId: mailbox.id }
    });
  } catch (error) {
    await markLogimailApprovalProvisioningFailed("mailbox_requests", requestId, request.metadata, actor, error);
    throw error;
  }

  await writeLogimailAudit({ workspaceId: String(request.workspace_id), actor, action: "logimail.mailbox_request_approved_telegram", targetType: "mailbox_request", targetId: requestId, metadata: { emailAddress: request.email_address, provisionedMailboxId: mailbox.id } });
  await writePlatformAuditLog({ actor, action: "logimail_request_approved_telegram", targetType: "logimail_request", targetId: `mailbox:${requestId}`, metadata: { requestType: "mailbox", workspaceId: request.workspace_id, emailAddress: request.email_address, provisionedMailboxId: mailbox.id } });
  return { requestId, requestType: "mailbox", status: "approved", mailboxId: String(mailbox.id) };
}

export async function confirmPlatformSubscriptionPayment(paymentId: string, actor: string) {
  const payment = await getLegacyPayment(paymentId);
  if (payment.status !== "waiting_confirm") throw new Error("platform_payment_not_waiting_confirm");
  if (!payment.subscription_id) throw new Error("platform_payment_subscription_missing");

  const subscription = await getLegacySubscription(payment.subscription_id);
  const currentPlan = await getLegacyPlan(subscription.plan_id);
  const targetPlan = await getLegacyPlan(payment.plan_id ?? subscription.plan_id);
  const transition = computeConfirmedSubscriptionTransition({ subscription, payment, currentPlan, targetPlan });

  const { error } = await db().rpc("apply_subscription_payment_confirmation", {
    p_payment_id: payment.id,
    p_confirmed_by: actor,
    p_next_plan_id: transition.planId,
    p_current_period_start: transition.currentPeriodStart,
    p_current_period_end: transition.currentPeriodEnd,
    p_subscription_metadata: transition.metadata
  });
  if (error) throw error;

  await writePlatformAuditLog({
    actor,
    action: "subscription_payment_confirmed_telegram",
    targetType: "subscription_payment",
    targetId: payment.id,
    metadata: {
      restaurantId: payment.restaurant_id,
      subscriptionId: subscription.id,
      previousPlanId: subscription.plan_id,
      nextPlanId: transition.planId,
      currentPeriodEnd: transition.currentPeriodEnd
    }
  });
  await mirrorLegacyPaymentFinalStateToBillingV2(payment.id);
  return { paymentId: payment.id, restaurantId: payment.restaurant_id, currentPeriodEnd: transition.currentPeriodEnd };
}

export async function rejectPlatformSubscriptionPayment(paymentId: string, actor: string, reason = "Từ chối từ LogiVN DevOps Bot") {
  const { data, error } = await db()
    .from("subscription_payment_logs")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_reason: reason
    })
    .eq("id", paymentId)
    .eq("status", "waiting_confirm")
    .select("id,restaurant_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("platform_payment_not_waiting_confirm");

  await writePlatformAuditLog({
    actor,
    action: "subscription_payment_rejected_telegram",
    targetType: "subscription_payment",
    targetId: paymentId,
    metadata: { restaurantId: data.restaurant_id, reason }
  });
  await mirrorLegacyPaymentFinalStateToBillingV2(paymentId);
  return { paymentId, restaurantId: String(data.restaurant_id) };
}

export async function updatePlatformTenantStatusFromTelegram({
  restaurantId,
  status,
  reason,
  actor
}: {
  restaurantId: string;
  status: "active" | "suspended" | "deleted";
  reason?: string;
  actor: string;
}) {
  const now = new Date().toISOString();
  const update =
    status === "active"
      ? { platform_status: "active", suspended_at: null, suspended_reason: null, deleted_at: null }
      : status === "suspended"
        ? { platform_status: "suspended", suspended_at: now, suspended_reason: reason || "Tạm dừng từ LogiVN DevOps Bot" }
        : { platform_status: "deleted", deleted_at: now, suspended_reason: reason || "Xóa mềm từ LogiVN DevOps Bot" };

  const { data, error } = await db().from("restaurants").update(update).eq("id", restaurantId).select("id,name,slug").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("platform_tenant_not_found");

  if (status === "suspended") {
    const { error: subscriptionError } = await db()
      .from("restaurant_subscriptions")
      .update({ status: "suspended", suspended_at: now, updated_at: now })
      .eq("restaurant_id", restaurantId)
      .in("status", ["trialing", "pending_payment", "active", "past_due"]);
    if (subscriptionError && !isMissingOperationalSchema(subscriptionError)) throw subscriptionError;
  }

  await writePlatformAuditLog({
    actor,
    action: "tenant_status_updated_telegram",
    targetType: "restaurant",
    targetId: restaurantId,
    metadata: { status, reason: reason || null }
  });
  return { id: String(data.id), name: String(data.name ?? "Không rõ quán"), slug: String(data.slug ?? "") };
}

export async function createPlatformSession(input: PlatformSessionInput) {
  const token = createSignedToken(sessionSecret());
  const expiresAt = new Date(Date.now() + sessionTtlSeconds(input.ttlSeconds) * 1000).toISOString();
  const { error } = await db().from("platform_telegram_sessions").insert({
    connection_id: input.connection.id,
    session_key_hash: tokenHash(token),
    action: input.action,
    payload: input.payload ?? {},
    expires_at: expiresAt
  });
  if (error) throw error;
  return token;
}

export async function claimPlatformSession(token: string, telegramUserId: number) {
  assertSignedToken(token, sessionSecret());
  const hash = tokenHash(token);
  const { data: session, error } = await db().from("platform_telegram_sessions").select("*").eq("session_key_hash", hash).maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("platform_session_not_found");
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await deletePlatformSession(session.id);
    throw new Error("platform_session_expired");
  }

  const connection = await getPlatformConnectionByIdForTelegramUser(String(session.connection_id), telegramUserId);
  if (!connection) throw new Error("platform_connection_not_authorized");
  const consumed = await consumePlatformSession(String(session.id));
  if (!consumed) throw new Error("platform_session_replayed");
  await recordPlatformTelegramAudit({ connection, action: String(session.action), outcome: "accepted", metadata: { callback: true } });
  return {
    connection,
    session: {
      id: String(session.id),
      action: String(session.action),
      payload: session.payload && typeof session.payload === "object" ? (session.payload as Record<string, unknown>) : {}
    }
  };
}

export async function recordPlatformTelegramAudit(input: {
  connection?: PlatformTelegramConnection | null;
  telegramUserId?: number | null;
  action: string;
  outcome: "accepted" | "denied" | "failed" | "sent" | "skipped";
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const result = await db().from("platform_telegram_audit_logs").insert({
    connection_id: input.connection?.id ?? null,
    telegram_user_id: input.connection?.telegram_user_id ?? input.telegramUserId ?? null,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    outcome: input.outcome,
    metadata: input.metadata ?? {}
  });
  if (isMissingPlatformTelegramSchema(result.error)) return;
  if (result.error) throw result.error;
}

export function hasPlatformScope(connection: PlatformTelegramConnection, scope: string) {
  if (connection.role === "ADMIN") return true;
  return connection.scopes.includes(scope) || connection.scopes.includes("platform.admin");
}

async function refreshPlatformConnectionsAccess(connections: PlatformTelegramConnection[]) {
  const refreshed = await Promise.all(connections.map(refreshPlatformConnectionAccess));
  return refreshed.filter((connection): connection is PlatformTelegramConnection => Boolean(connection));
}

async function refreshPlatformConnectionAccess(connection: PlatformTelegramConnection) {
  if (!connection.platform_admin_user_id) return connection;

  const { data, error } = await db()
    .from("platform_admin_users")
    .select("id,role,status")
    .eq("id", connection.platform_admin_user_id)
    .maybeSingle();
  if (isMissingPlatformTelegramSchema(error)) return connection;
  if (error) throw error;

  if (!data || data.status !== "active") {
    await revokeStalePlatformConnection(connection, "platform_admin_not_active");
    return null;
  }

  const access = platformTelegramAccessForAdminRole(normalizeAdminRole(data.role));
  const next = { ...connection, role: access.telegramRole, scopes: access.scopes };
  if (platformConnectionAccessChanged(connection, next)) {
    await persistPlatformConnectionAccess(next).catch(() => undefined);
  }
  return next;
}

function platformConnectionAccessChanged(previous: PlatformTelegramConnection, next: PlatformTelegramConnection) {
  return previous.role !== next.role || previous.scopes.join("\u0000") !== next.scopes.join("\u0000");
}

async function persistPlatformConnectionAccess(connection: PlatformTelegramConnection) {
  const { error } = await db()
    .from("platform_telegram_connections")
    .update({ role: connection.role, scopes: connection.scopes, last_seen_at: new Date().toISOString() })
    .eq("id", connection.id)
    .eq("telegram_user_id", connection.telegram_user_id)
    .eq("status", "active");
  if (error) throw error;
}

async function revokeStalePlatformConnection(connection: PlatformTelegramConnection, reason: string) {
  const now = new Date().toISOString();
  const { error } = await db()
    .from("platform_telegram_connections")
    .update({
      status: "revoked",
      revoked_at: now,
      metadata: {
        revokedBy: "platform_current_access_guard",
        revokedReason: reason,
        platformAdminUserId: connection.platform_admin_user_id ?? null
      }
    })
    .eq("id", connection.id)
    .eq("telegram_user_id", connection.telegram_user_id)
    .eq("status", "active");
  if (error) throw error;

  await recordPlatformTelegramAudit({
    connection,
    action: "platform.telegram.connection.revoked_by_current_access",
    outcome: "denied",
    targetType: "platform_telegram_connection",
    targetId: connection.id,
    metadata: { reason, revokedAt: now }
  }).catch(() => undefined);
}

function normalizeConnection(row: Record<string, unknown>): PlatformTelegramConnection {
  return {
    id: String(row.id),
    telegram_user_id: Number(row.telegram_user_id),
    telegram_chat_id: Number(row.telegram_chat_id),
    telegram_username: row.telegram_username ? String(row.telegram_username) : null,
    display_name: row.display_name ? String(row.display_name) : null,
    role: normalizeRole(row.role),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    status: String(row.status ?? "active"),
    platform_admin_user_id: metadataPlatformAdminUserId(row.metadata)
  };
}

function metadataPlatformAdminUserId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as { platformAdminUserId?: unknown; platform_admin_user_id?: unknown }).platformAdminUserId ??
    (metadata as { platform_admin_user_id?: unknown }).platform_admin_user_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRole(value: unknown): PlatformTelegramRole {
  if (value === "SUPPORT" || value === "SRE" || value === "ADMIN") return value;
  return "DEV";
}

async function resolveCurrentPlatformTokenAccess(tokenRow: Record<string, unknown>) {
  const adminUserId = typeof tokenRow.platform_admin_user_id === "string" ? tokenRow.platform_admin_user_id : null;
  const adminSessionId = typeof tokenRow.platform_admin_session_id === "string" ? tokenRow.platform_admin_session_id : null;

  if (adminUserId) {
    const { data, error } = await db().from("platform_admin_users").select("id,role,status").eq("id", adminUserId).maybeSingle();
    if (isMissingPlatformTelegramSchema(error)) return tokenAccessFromSnapshot(tokenRow);
    if (error) throw error;
    if (!data || data.status !== "active") throw new Error("platform_connect_admin_not_active");
    const access = platformTelegramAccessForAdminRole(normalizeAdminRole(data.role));

    if (adminSessionId) {
      const { data: session, error: sessionError } = await db()
        .from("platform_admin_sessions")
        .select("id,expires_at,revoked_at,user_id")
        .eq("id", adminSessionId)
        .eq("user_id", adminUserId)
        .maybeSingle();
      if (isMissingPlatformTelegramSchema(sessionError)) return access;
      if (sessionError) throw sessionError;
      if (!session || session.revoked_at || new Date(String(session.expires_at)).getTime() <= Date.now()) {
        throw new Error("platform_connect_session_not_active");
      }
    }

    return access;
  }

  return tokenAccessFromSnapshot(tokenRow);
}

function tokenAccessFromSnapshot(tokenRow: Record<string, unknown>) {
  const telegramRole = normalizeRole(tokenRow.telegram_role);
  const scopes = Array.isArray(tokenRow.scopes) ? tokenRow.scopes.map(String).filter(Boolean).slice(0, 80) : defaultScopes(telegramRole);
  return { telegramRole, scopes };
}

function normalizeAdminRole(value: unknown): PlatformAdminRole {
  if (value === "owner" || value === "ops" || value === "billing" || value === "content" || value === "support") return value;
  return "readonly";
}

function platformTelegramAccessForAdminRole(role: PlatformAdminRole): { telegramRole: PlatformTelegramRole; scopes: string[] } {
  if (role === "owner") return { telegramRole: "ADMIN", scopes: ["platform.admin", "infra.read", "backup.trigger", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read", "billing.approve", "logimail.approve", "tenants.read", "tenants.manage"] };
  if (role === "ops") return { telegramRole: "SRE", scopes: ["infra.read", "backup.trigger", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read", "logimail.approve", "tenants.read", "tenants.manage"] };
  if (role === "billing") return { telegramRole: "DEV", scopes: ["billing.approve", "tenants.read"] };
  if (role === "support") return { telegramRole: "SUPPORT", scopes: ["infra.read", "queues.read", "incidents.read", "tenants.read", "support.grants.request"] };
  return { telegramRole: "DEV", scopes: ["infra.read", "queues.read", "incidents.read", "tenants.read"] };
}

async function getPlatformConnectionByIdForTelegramUser(connectionId: string, telegramUserId: number) {
  const { data, error } = await db()
    .from("platform_telegram_connections")
    .select(PLATFORM_CONNECTION_SELECT)
    .eq("id", connectionId)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return refreshPlatformConnectionAccess(normalizeConnection(data));
}

async function deletePlatformSession(id: string) {
  const { error } = await db().from("platform_telegram_sessions").delete().eq("id", id);
  if (error) throw error;
}

async function consumePlatformSession(id: string) {
  const { data, error } = await db().from("platform_telegram_sessions").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function defaultScopes(role: PlatformTelegramRole) {
  if (role === "SUPPORT") return ["infra.read", "queues.read", "incidents.read", "tenants.read", "support.grants.request"];
  if (role === "SRE") return ["infra.read", "backup.trigger", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read", "logimail.approve", "tenants.manage"];
  if (role === "ADMIN") return ["platform.admin", "infra.read", "backup.trigger", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read", "billing.approve", "logimail.approve", "tenants.manage"];
  return ["infra.read", "queues.read", "incidents.read", "deploy.read"];
}

async function getLegacyPayment(paymentId: string): Promise<LegacyPaymentSnapshot> {
  const { data, error } = await db().from("subscription_payment_logs").select("*").eq("id", paymentId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("platform_payment_not_found");
  return normalizeLegacyPayment(data as Record<string, unknown>);
}

async function getLegacySubscription(subscriptionId: string): Promise<LegacySubscriptionSnapshot> {
  const { data, error } = await db().from("restaurant_subscriptions").select("*").eq("id", subscriptionId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("platform_subscription_not_found");
  return normalizeLegacySubscription(data as Record<string, unknown>);
}

async function getLegacyPlan(planId: string): Promise<LegacyPlanSnapshot> {
  const { data, error } = await db().from("saas_plans").select("id,code,name,monthly_price").eq("id", planId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("platform_plan_not_found");
  return {
    id: String(data.id),
    code: String(data.code ?? "pro"),
    name: String(data.name ?? "LogiVN"),
    monthly_price: Number(data.monthly_price ?? 0)
  };
}

function normalizeLegacyPayment(row: Record<string, unknown>): LegacyPaymentSnapshot {
  return {
    id: String(row.id),
    restaurant_id: String(row.restaurant_id),
    subscription_id: row.subscription_id ? String(row.subscription_id) : null,
    plan_id: row.plan_id ? String(row.plan_id) : null,
    months: Number(row.months ?? 1),
    status: String(row.status ?? "unknown"),
    transfer_content: String(row.transfer_content ?? ""),
    amount: Number(row.amount ?? 0),
    confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null
  };
}

function normalizeLegacySubscription(row: Record<string, unknown>): LegacySubscriptionSnapshot {
  return {
    id: String(row.id),
    restaurant_id: String(row.restaurant_id),
    plan_id: String(row.plan_id),
    status: normalizeSubscriptionStatus(row.status),
    current_period_start: row.current_period_start ? String(row.current_period_start) : null,
    current_period_end: row.current_period_end ? String(row.current_period_end) : null,
    trial_started_at: row.trial_started_at ? String(row.trial_started_at) : null,
    trial_ends_at: row.trial_ends_at ? String(row.trial_ends_at) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : {}
  };
}

function normalizeSubscriptionStatus(value: unknown): LegacySubscriptionStatus {
  if (value === "trialing" || value === "pending_payment" || value === "active" || value === "past_due" || value === "suspended" || value === "cancelled" || value === "expired") return value;
  return "expired";
}

function normalizePlatformStatus(value: unknown): "active" | "suspended" | "deleted" {
  if (value === "suspended" || value === "deleted") return value;
  return "active";
}

function tenantPriority(tenant: PlatformTenantAction) {
  let score = tenant.riskFlags.length * 10;
  if (tenant.platformStatus !== "active") score += 8;
  if (tenant.subscriptionStatus === "pending_payment" || tenant.subscriptionStatus === "past_due") score += 6;
  if (!tenant.subscriptionStatus) score += 4;
  return score;
}

function daysUntil(value: unknown) {
  if (!value) return 999;
  const time = new Date(String(value)).getTime();
  if (!Number.isFinite(time)) return 999;
  return Math.ceil((time - Date.now()) / 86_400_000);
}

function addPreciseDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getSubscriptionWindowEnd(subscription: Pick<LegacySubscriptionSnapshot, "current_period_end" | "trial_ends_at">) {
  return subscription.current_period_end || subscription.trial_ends_at;
}

function isSubscriptionUsable(subscription: Pick<LegacySubscriptionSnapshot, "status" | "current_period_end" | "trial_ends_at">, now = new Date()) {
  const accessEnd = getSubscriptionWindowEnd(subscription);
  const hasCurrentWindow = accessEnd ? new Date(accessEnd).getTime() >= now.getTime() : true;
  if (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "cancelled") return hasCurrentWindow;
  if (subscription.status === "pending_payment") return accessEnd ? new Date(accessEnd).getTime() >= now.getTime() : false;
  if (subscription.status !== "past_due" || !subscription.current_period_end) return false;
  const periodEnd = new Date(subscription.current_period_end).getTime();
  const graceEnd = addPreciseDays(new Date(subscription.current_period_end), 7).getTime();
  const nowTime = now.getTime();
  return periodEnd < nowTime && nowTime <= graceEnd;
}

function computeConfirmedSubscriptionTransition({
  subscription,
  payment,
  currentPlan,
  targetPlan,
  now = new Date()
}: {
  subscription: LegacySubscriptionSnapshot;
  payment: LegacyPaymentSnapshot;
  currentPlan: LegacyPlanSnapshot;
  targetPlan: LegacyPlanSnapshot;
  now?: Date;
}) {
  const billingAction = targetPlan.id === currentPlan.id ? "renew" : targetPlan.monthly_price > currentPlan.monthly_price ? "upgrade" : "downgrade";
  const nowIso = now.toISOString();
  const currentWindowEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
  const hasCurrentWindow = Boolean(currentWindowEnd && currentWindowEnd.getTime() > now.getTime());
  const months = Math.max(1, Number(payment.months) || 1);
  const metadata = subscription.metadata ?? {};

  if (billingAction === "downgrade" && isSubscriptionUsable(subscription, now)) {
    throw new Error("platform_downgrade_requires_end_of_cycle");
  }

  if (billingAction === "renew") {
    const basePeriod = hasCurrentWindow && currentWindowEnd ? currentWindowEnd : now;
    return {
      planId: currentPlan.id,
      currentPeriodStart: subscription.current_period_start ?? nowIso,
      currentPeriodEnd: addMonths(basePeriod, months).toISOString(),
      metadata: { ...metadata, billingAction, lastPaymentId: payment.id, lastPaymentConfirmedAt: nowIso }
    };
  }

  if (!isSubscriptionUsable(subscription, now) || subscription.status === "trialing") {
    return {
      planId: targetPlan.id,
      currentPeriodStart: nowIso,
      currentPeriodEnd: addMonths(now, months).toISOString(),
      metadata: {
        ...metadata,
        billingAction,
        lastPaymentId: payment.id,
        lastPaymentConfirmedAt: nowIso,
        switchedFromPlanId: subscription.plan_id,
        switchedToPlanId: targetPlan.id,
        ...(subscription.status === "trialing" ? { trialConvertedAt: nowIso } : {})
      }
    };
  }

  const activeWindowEnd = currentWindowEnd ?? now;
  const remainingDays = Math.max(0, (activeWindowEnd.getTime() - now.getTime()) / 86_400_000);
  const convertedCreditDays = currentPlan.monthly_price > 0 && targetPlan.monthly_price > 0
    ? Math.max(0, Math.floor((remainingDays * currentPlan.monthly_price) / targetPlan.monthly_price))
    : 0;
  return {
    planId: targetPlan.id,
    currentPeriodStart: nowIso,
    currentPeriodEnd: addPreciseDays(addMonths(now, months), convertedCreditDays).toISOString(),
    metadata: {
      ...metadata,
      billingAction,
      lastPaymentId: payment.id,
      lastPaymentConfirmedAt: nowIso,
      switchedFromPlanId: subscription.plan_id,
      switchedToPlanId: targetPlan.id,
      convertedCreditDays,
      convertedFromRemainingDays: Math.ceil(remainingDays)
    }
  };
}

async function mirrorLegacyPaymentFinalStateToBillingV2(paymentId: string) {
  try {
    const payment = await getLegacyPayment(paymentId);
    if (!payment.subscription_id) return;
    const subscription = await getLegacySubscription(payment.subscription_id);
    const legacyPlan = await getLegacyPlan(subscription.plan_id);
    const { data: v2Subscription, error: v2SubscriptionError } = await db()
      .from("subscriptions")
      .select("id")
      .eq("restaurant_id", payment.restaurant_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isMissingOperationalSchema(v2SubscriptionError) || !v2Subscription?.id) return;
    if (v2SubscriptionError) throw v2SubscriptionError;

    const { data: v2Plan, error: v2PlanError } = await db()
      .from("subscription_plans")
      .select("id")
      .eq("code", normalizeBillingPlanCode(legacyPlan.code))
      .maybeSingle();
    if (isMissingOperationalSchema(v2PlanError)) return;
    if (v2PlanError) throw v2PlanError;

    const { data: v2Payment, error: v2PaymentError } = await db()
      .from("payments")
      .select("id,invoice_id")
      .eq("transfer_code", payment.transfer_content)
      .maybeSingle();
    if (isMissingOperationalSchema(v2PaymentError) || !v2Payment?.id) return;
    if (v2PaymentError) throw v2PaymentError;

    const paymentStatus = payment.status === "confirmed" ? "confirmed" : payment.status === "rejected" ? "failed" : payment.status === "expired" ? "expired" : "waiting_confirmation";
    const now = new Date().toISOString();

    await db().from("payments").update({ status: paymentStatus, confirmed_at: payment.confirmed_at ?? null, updated_at: now }).eq("id", v2Payment.id);
    await db().from("billing_payment_logs").insert({
      payment_id: v2Payment.id,
      event_type: paymentStatus === "confirmed" ? "payment_confirmed" : "payment_closed",
      actor_type: "system",
      payload: { source: "platform_telegram_bridge", legacyPaymentId: payment.id, status: payment.status }
    });
    if (v2Payment.invoice_id) {
      await db().from("invoices").update({ status: paymentStatus === "confirmed" ? "paid" : "failed", paid_at: payment.confirmed_at ?? null, updated_at: now }).eq("id", v2Payment.invoice_id);
    }
    await db()
      .from("subscriptions")
      .update({
        plan_id: v2Plan?.id ?? undefined,
        status: paymentStatus === "confirmed" ? "active" : undefined,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        updated_at: now
      })
      .eq("id", v2Subscription.id);
  } catch (error) {
    if (readEnv("NODE_ENV") === "production") throw error;
  }
}

async function writePlatformAuditLog(input: { actor: string; action: string; targetType: string; targetId?: string | null; metadata?: Record<string, unknown> }) {
  const { error } = await db().from("platform_audit_logs").insert({
    actor: input.actor,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {}
  });
  if (error && !isMissingOperationalSchema(error)) throw error;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(row: Record<string, unknown> | null | undefined, key: string) {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBillingPlanCode(value: string) {
  return value === "premium" ? "premium" : "pro";
}

function isMissingPlatformTelegramSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /platform_telegram|platform_support_access_grants/i.test(error.message ?? "")
  );
}

function isMissingOperationalSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    isMissingPlatformTelegramSchema(error) ||
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /subscription_|restaurant|payment|invoice|billing_|saas_plans|platform_audit_logs/i.test(error.message ?? "")
  );
}

function isMissingBackupSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist") ||
    /backup_(jobs|artifacts|alerts|restore_tests|settings|events)/i.test(error.message ?? "")
  );
}

function isMissingLogimailSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /logimail|account_requests|domain_requests|mailbox_requests|Could not find|does not exist/i.test(error.message ?? "")
  );
}

async function readLogimailProfiles(ids: string[]) {
  if (!ids.length) return [] as Record<string, unknown>[];
  const { data, error } = await logimailDb().from("profiles").select("id,email,full_name,account_status").in("id", ids);
  if (isMissingLogimailSchema(error)) return [];
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

async function readLogimailProfile(id: string) {
  if (!id) return null;
  const { data, error } = await logimailDb().from("profiles").select("id,email,full_name,account_status").eq("id", id).maybeSingle();
  if (isMissingLogimailSchema(error)) return null;
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function readLogimailWorkspaces(ids: string[]) {
  if (!ids.length) return [] as Record<string, unknown>[];
  const { data, error } = await logimailDb().from("workspaces").select("id,name,slug").in("id", ids);
  if (isMissingLogimailSchema(error)) return [];
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

async function readLogimailWorkspace(id: string) {
  if (!id) return null;
  const { data, error } = await logimailDb().from("workspaces").select("id,name,slug").eq("id", id).maybeSingle();
  if (isMissingLogimailSchema(error)) return null;
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function readLogimailDomains(ids: string[]) {
  if (!ids.length) return [] as Record<string, unknown>[];
  const { data, error } = await logimailDb().from("domains").select("id,workspace_id,domain,status,approval_status,registration_enabled").in("id", ids);
  if (isMissingLogimailSchema(error)) return [];
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

async function readLogimailDomain(id: string) {
  if (!id) return null;
  const { data, error } = await logimailDb().from("domains").select("id,workspace_id,domain,status,approval_status,registration_enabled").eq("id", id).maybeSingle();
  if (isMissingLogimailSchema(error)) return null;
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function readLogimailMailboxCounts(domainIds: string[]) {
  const counts = new Map<string, number>();
  const ids = uniqueStrings(domainIds);
  if (!ids.length) return counts;
  const { data, error } = await logimailDb().from("mailboxes").select("domain_id").in("domain_id", ids).limit(5000);
  if (isMissingLogimailSchema(error)) return counts;
  if (error) throw error;
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const domainId = stringField(row, "domain_id");
    if (domainId) counts.set(domainId, (counts.get(domainId) ?? 0) + 1);
  }
  return counts;
}

async function getRawPendingLogimailRequest(type: PlatformLogimailRequestType, requestId: string) {
  const data = await readRawPendingLogimailRequest(type, requestId);
  if (!data) throw new Error("logimail_request_not_pending");
  return data;
}

async function readRawPendingLogimailRequest(type: PlatformLogimailRequestType, requestId: string) {
  const { data, error } = await logimailDb().from(logimailRequestTable(type)).select("*").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (isMissingLogimailSchema(error)) return null;
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function claimLogimailApprovalRequest(input: {
  table: string;
  requestId: string;
  metadata: unknown;
  actor: string;
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
        reviewedFrom: "platform_devops_bot",
        provisioningStatus: "provisioning",
        ...(input.extraMetadata ?? {})
      }
    })
    .eq("id", input.requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("logimail_request_not_pending");
}

async function finalizeLogimailApprovalRequest(input: {
  table: string;
  requestId: string;
  metadata: unknown;
  actor: string;
  provisionedColumn?: string;
  provisionedId?: string;
  extraMetadata?: Record<string, unknown>;
}) {
  const update: Record<string, unknown> = {
    metadata: {
      ...asRecord(input.metadata),
      reviewedByActor: input.actor,
      reviewedFrom: "platform_devops_bot",
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
  if (!data) throw new Error("logimail_request_finalize_failed");
}

async function markLogimailApprovalProvisioningFailed(table: string, requestId: string, metadata: unknown, actor: string, error: unknown) {
  const { error: updateError } = await logimailDb()
    .from(table)
    .update({
      metadata: {
        ...asRecord(metadata),
        reviewedByActor: actor,
        reviewedFrom: "platform_devops_bot",
        provisioningStatus: "failed",
        provisioningError: errorMessage(error)
      }
    })
    .eq("id", requestId)
    .eq("status", "approved");
  if (updateError && !isMissingLogimailSchema(updateError)) throw updateError;
}

async function uniqueLogimailWorkspaceSlug(value: string) {
  const base = slugBaseFromText(value);
  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`.slice(0, 63);
    const { data, error } = await logimailDb().from("workspaces").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${base.slice(0, 54)}-${Date.now().toString(36)}`;
}

function normalizeLogimailDomain(value: string) {
  const domain = value.trim().toLowerCase();
  if (!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) throw new Error("logimail_invalid_domain");
  return domain;
}

function securityCodePurpose(value: unknown): "account_access" | "account_signup" | "password_reset" {
  return value === "account_signup" || value === "password_reset" ? value : "account_access";
}

function securityCodeStatus(value: unknown): PlatformLogimailSecurityCode["status"] {
  if (value === "used" || value === "expired" || value === "revoked") return value;
  return "active";
}

function logimailSecurityCodeSecret() {
  const secret = readEnv("LOGIMAIL_SECURITY_CODE_SECRET") || "";
  if (secret.length < 16) throw new Error("logimail_security_code_secret_missing");
  return secret;
}

function logimailSecurityCodeKey() {
  return createHash("sha256").update(logimailSecurityCodeSecret()).digest();
}

function normalizeLogimailSecurityCodeValue(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 8 || normalized.length > 32) throw new Error("logimail_security_code_invalid");
  return normalized;
}

function hashLogimailSecurityCode(code: string) {
  return createHmac("sha256", logimailSecurityCodeSecret()).update(normalizeLogimailSecurityCodeValue(code)).digest("hex");
}

function encryptLogimailSecurityCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", logimailSecurityCodeKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptLogimailSecurityCode(value: string | null) {
  if (!value) return null;
  try {
    const [ivText, tagText, encryptedText] = value.split(".");
    if (!ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv("aes-256-gcm", logimailSecurityCodeKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function generateLogimailSecurityCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let value = "LM";
  for (let index = 0; index < 10; index += 1) value += alphabet[bytes[index] % alphabet.length];
  return `${value.slice(0, 2)}-${value.slice(2, 6)}-${value.slice(6, 10)}-${value.slice(10)}`;
}

function logimailSecurityCodeHint(code: string) {
  return normalizeLogimailSecurityCodeValue(code).slice(-4);
}

function normalizeSecurityCodeTtl(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return 24;
  return Math.min(168, Math.max(1, Math.round(Number(value))));
}

async function writeLogimailAudit(input: { workspaceId?: string | null; actor: string; action: string; targetType: string; targetId: string; metadata?: Record<string, unknown> }) {
  const { error } = await logimailDb().from("audit_logs").insert({
    workspace_id: input.workspaceId ?? null,
    actor_id: null,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    metadata: { ...(input.metadata ?? {}), actor: input.actor, source: "platform_devops_bot" }
  });
  if (error && !isMissingLogimailSchema(error)) throw error;
}

function logimailRequestTable(type: PlatformLogimailRequestType) {
  if (type === "account") return "account_requests";
  if (type === "domain") return "domain_requests";
  return "mailbox_requests";
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((value) => (typeof value === "string" ? value : value ? String(value) : "")).filter(Boolean)));
}

function slugBaseFromText(value: string) {
  const ascii = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55);
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length >= 3 ? slug : `logimail-${Date.now().toString(36)}`;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "LogiMail provisioning failed.";
  return message.slice(0, 500);
}

function throwOnError(result: { error: unknown }) {
  if (result.error) throw result.error;
}

async function resolveBackupEnvironment(preferred: string) {
  const normalized = preferred.trim() || "prod";
  const current = await db()
    .from("backup_jobs")
    .select("id")
    .eq("environment", normalized)
    .limit(1)
    .maybeSingle();
  if (isMissingBackupSchema(current.error)) return normalized;
  if (current.error) throw current.error;
  if (current.data) return normalized;

  const latestJob = await db()
    .from("backup_jobs")
    .select("environment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isMissingBackupSchema(latestJob.error)) return normalized;
  if (latestJob.error) throw latestJob.error;
  const environment = stringField(latestJob.data as Record<string, unknown> | null, "environment");
  if (environment) return environment;

  const latestRestore = await db()
    .from("backup_restore_tests")
    .select("environment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isMissingBackupSchema(latestRestore.error)) return normalized;
  if (latestRestore.error) throw latestRestore.error;
  return stringField(latestRestore.data as Record<string, unknown> | null, "environment") ?? normalized;
}

async function getBackupArtifactsForJob(jobId: string | null) {
  if (!jobId) return [];
  const { data, error } = await db()
    .from("backup_artifacts")
    .select("id,job_id,artifact_type,status,storage_bucket,storage_path,file_name,file_size,encrypted,created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (isMissingBackupSchema(error)) return [];
  if (error) throw error;
  return ((data ?? []) as BackupArtifactRow[]).map(mapBackupArtifact);
}

function emptyPlatformBackupSnapshot(environment: string): PlatformBackupSnapshot {
  return {
    schemaReady: false,
    generatedAt: new Date().toISOString(),
    environment,
    latestJob: null,
    lastSuccessfulJob: null,
    artifacts: [],
    restoreTest: null,
    openAlerts: [],
    queuedManualCount: 0,
    ageHours: null,
    rpoRisk: "high",
    warnings: ["Cần chạy migration backup_dr_foundation trước khi đọc backup."]
  };
}

function mapBackupJob(job: BackupJobRow) {
  return {
    id: String(job.id),
    environment: String(job.environment),
    backupType: String(job.backup_type),
    retentionClass: String(job.retention_class),
    status: job.status,
    triggerSource: String(job.trigger_source),
    triggeredBy: job.triggered_by ? String(job.triggered_by) : null,
    storageProvider: String(job.storage_provider),
    storageBucket: job.storage_bucket ? String(job.storage_bucket) : null,
    storagePrefix: job.storage_prefix ? String(job.storage_prefix) : null,
    startedAt: job.started_at ? String(job.started_at) : null,
    finishedAt: job.finished_at ? String(job.finished_at) : null,
    durationMs: Number(job.duration_ms ?? 0),
    fileSize: Number(job.file_size ?? 0),
    artifactCount: Number(job.artifact_count ?? 0),
    encrypted: Boolean(job.encrypted),
    checksumStatus: String(job.checksum_status ?? "pending"),
    verifyStatus: String(job.verify_status ?? "pending"),
    retentionApplied: Boolean(job.retention_applied),
    errorStep: job.error_step ? String(job.error_step) : null,
    errorMessage: job.error_message ? String(job.error_message) : null,
    summary: asRecord(job.summary),
    metadata: asRecord(job.metadata),
    createdAt: String(job.created_at)
  };
}

function mapBackupArtifact(artifact: BackupArtifactRow) {
  return {
    id: String(artifact.id),
    jobId: String(artifact.job_id),
    artifactType: String(artifact.artifact_type),
    status: String(artifact.status),
    storageBucket: artifact.storage_bucket ? String(artifact.storage_bucket) : null,
    storagePath: artifact.storage_path ? String(artifact.storage_path) : null,
    fileName: artifact.file_name ? String(artifact.file_name) : null,
    fileSize: Number(artifact.file_size ?? 0),
    encrypted: Boolean(artifact.encrypted),
    createdAt: String(artifact.created_at)
  };
}

function mapBackupRestoreTest(test: BackupRestoreTestRow) {
  return {
    id: String(test.id),
    jobId: test.job_id ? String(test.job_id) : null,
    environment: String(test.environment),
    status: String(test.status),
    schemaVerified: Boolean(test.schema_verified),
    rowCountVerified: Boolean(test.row_count_verified),
    criticalTablesVerified: Boolean(test.critical_tables_verified),
    errorMessage: test.error_message ? String(test.error_message) : null,
    verificationSummary: asRecord(test.verification_summary),
    startedAt: test.started_at ? String(test.started_at) : null,
    finishedAt: test.finished_at ? String(test.finished_at) : null,
    createdAt: String(test.created_at)
  };
}

function mapBackupAlert(alert: BackupAlertRow) {
  return {
    id: String(alert.id),
    jobId: alert.job_id ? String(alert.job_id) : null,
    severity: alert.severity,
    status: alert.status,
    title: String(alert.title),
    message: String(alert.message),
    rpoRisk: alert.rpo_risk,
    createdAt: String(alert.created_at)
  };
}

function isBackupDataJob(job: ReturnType<typeof mapBackupJob>) {
  if (job.backupType === "restore_test" || job.triggerSource === "restore_test") return false;
  if (job.status === "success" || job.status === "warn") return isCompletedDataBackupJob(job);
  return true;
}

function isCompletedDataBackupJob(job: ReturnType<typeof mapBackupJob>) {
  if (job.backupType === "restore_test" || job.triggerSource === "restore_test") return false;
  return job.artifactCount > 0 || job.fileSize > 0;
}

function backupHoursSince(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.round(Math.max(0, now - timestamp) / 36_000) / 100;
}

function platformBackupRpoRisk(input: { ageHours: number | null; latestStatus?: string | null; openCriticalAlerts?: number }): BackupRpoRisk {
  if (input.openCriticalAlerts && input.openCriticalAlerts > 0) return "high";
  if (!Number.isFinite(input.ageHours ?? NaN)) return "high";
  if (input.latestStatus === "failed") return "high";
  if ((input.ageHours ?? 999) > 36) return "high";
  if ((input.ageHours ?? 999) > 26) return "medium";
  return "low";
}

function db() {
  return supabaseAdmin() as any;
}

function logimailDb() {
  const client = db();
  return typeof client.schema === "function" ? client.schema("logimail") : client;
}

function sessionSecret() {
  return requiredEnv("PLATFORM_TELEGRAM_SESSION_SECRET");
}

function connectTokenSecret() {
  const explicit = readEnv("PLATFORM_TELEGRAM_CONNECT_TOKEN_SECRET");
  if (explicit) return explicit;
  if (readEnv("NODE_ENV") !== "production") {
    const fallback = readEnv("PLATFORM_TELEGRAM_SESSION_SECRET");
    if (fallback) return fallback;
  }
  return requiredEnv("PLATFORM_TELEGRAM_CONNECT_TOKEN_SECRET");
}

function sessionTtlSeconds(input?: number) {
  const parsed = Number(input ?? readEnv("PLATFORM_TELEGRAM_SESSION_TTL_SECONDS", "300"));
  return Number.isFinite(parsed) && parsed >= 30 ? parsed : 300;
}
