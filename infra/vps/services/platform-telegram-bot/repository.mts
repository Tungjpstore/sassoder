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
  const environment = readEnv("BACKUP_ENVIRONMENT") || readEnv("LOGIVN_ENV") || "prod";
  const jobSelect = "id,environment,backup_type,retention_class,status,trigger_source,triggered_by,storage_provider,storage_bucket,storage_prefix,started_at,finished_at,duration_ms,file_size,artifact_count,encrypted,checksum_status,verify_status,retention_applied,error_step,error_message,summary,metadata,created_at";
  const [jobsResult, latestSuccessResult, restoreTestResult, alertsResult, queuedManualResult] = await Promise.all([
    db()
      .from("backup_jobs")
      .select(jobSelect)
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(6),
    db()
      .from("backup_jobs")
      .select(jobSelect)
      .eq("environment", environment)
      .in("status", ["success", "warn"])
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  const latestJobs = ((jobsResult.data ?? []) as BackupJobRow[]).map(mapBackupJob);
  const latestJob = latestJobs[0] ?? null;
  const lastSuccessfulJob = latestSuccessResult.data ? mapBackupJob(latestSuccessResult.data as BackupJobRow) : null;
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
  if (role === "owner") return { telegramRole: "ADMIN", scopes: ["platform.admin", "infra.read", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read", "billing.approve", "tenants.read", "tenants.manage"] };
  if (role === "ops") return { telegramRole: "SRE", scopes: ["infra.read", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read", "tenants.read", "tenants.manage"] };
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
  if (role === "SRE") return ["infra.read", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read", "tenants.manage"];
  if (role === "ADMIN") return ["platform.admin", "infra.read", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read", "billing.approve", "tenants.manage"];
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
