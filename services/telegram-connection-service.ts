import "server-only";

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStaffEffectivePermissions } from "@/services/staff-permission-service";
import type { OperationalEvent } from "@/services/operational-event-bus";
import type { AiAgentAction } from "@/types/ai-agent";
import type { SessionProfile } from "@/types/domain";

const TOKEN_PREFIX = "lg1";
const SIGNATURE_LENGTH = 12;
const TELEGRAM_QUEUE_NAME = "telegram.notifications";
const TELEGRAM_DLQ_NAME = `${TELEGRAM_QUEUE_NAME}.dlq`;
const RETRYABLE_NOTIFICATION_STATUSES = ["failed", "rate_limited"] as const;
const TELEGRAM_TEST_NOTIFICATION_KINDS = ["order", "payment", "reservation", "inventory", "menu", "sla", "service", "staff"] as const;
const TELEGRAM_POLICY_RECIPIENT_SCOPES = ["permission", "admins", "branch", "silent"] as const;

const TELEGRAM_DEFAULT_POLICIES = [
  { eventType: "order.created", label: "Đơn mới", requiredPermission: "orders.update", priority: 2, escalationAfterSeconds: 300 },
  { eventType: "payment.waiting_confirm", label: "VietQR chờ xác nhận", requiredPermission: "payments.confirm", priority: 1, escalationAfterSeconds: 180 },
  { eventType: "reservation.created", label: "Đặt bàn mới", requiredPermission: "reservations.manage", priority: 2, escalationAfterSeconds: 600 },
  { eventType: "reservation.deposit_submitted", label: "Khách báo cọc", requiredPermission: "reservations.manage", priority: 1, escalationAfterSeconds: 300 },
  { eventType: "order.delivery_status_changed", label: "Giao hàng", requiredPermission: "orders.update", priority: 2, escalationAfterSeconds: 600 },
  { eventType: "service_request.created", label: "Khách gọi phục vụ", requiredPermission: "orders.update", priority: 1, escalationAfterSeconds: 180 },
  { eventType: "sla.warning", label: "Cảnh báo SLA", requiredPermission: "orders.update", priority: 1, escalationAfterSeconds: 120 },
  { eventType: "inventory.low", label: "Tồn kho thấp", requiredPermission: "inventory.view", priority: 2, escalationAfterSeconds: 3600 },
  { eventType: "menu.item_availability_suggested", label: "Gợi ý ẩn/mở món", requiredPermission: "menu.edit", priority: 2, escalationAfterSeconds: 1800 },
  { eventType: "staff.checked_in", label: "Nhân sự check-in", requiredPermission: "attendance.view", priority: 5, escalationAfterSeconds: 3600 },
  { eventType: "staff.request_created", label: "Duyệt nhân sự", requiredPermission: "approvals.review", priority: 2, escalationAfterSeconds: 1800 }
] as const;

type QueueCounts = {
  waiting?: number;
  active?: number;
  delayed?: number;
  failed?: number;
  completed?: number;
  paused?: number;
};

type GatewayFailedJob = {
  id?: string | number | null;
  name?: string | null;
  attemptsMade?: number | null;
  failedReason?: string | null;
  timestamp?: number | null;
  processedOn?: number | null;
  finishedOn?: number | null;
};

type TelegramTestNotificationKind = (typeof TELEGRAM_TEST_NOTIFICATION_KINDS)[number];
type TelegramPolicyRecipientScope = (typeof TELEGRAM_POLICY_RECIPIENT_SCOPES)[number];

type TelegramTestNotificationInput = {
  branchId?: string | null;
  kind?: TelegramTestNotificationKind;
};

type TelegramNotificationPolicyInput = {
  eventType: string;
  branchId?: string | null;
  enabled?: boolean;
  recipientScope?: TelegramPolicyRecipientScope;
  priority?: number;
  escalationAfterSeconds?: number | null;
  digestEnabled?: boolean;
};

type TelegramOwnerBriefingInput = {
  restaurantId: string;
  branchId?: string | null;
  command: "doanhthu" | "tinhhinh" | "tonkho" | "chat";
  actorRole: "ADMIN" | "STAFF";
  reply: string;
  intent: string;
  intentLabel?: string;
  provider: string;
  model: string;
  actions: AiAgentAction[];
};

export async function createTelegramConnectionToken(session: SessionProfile, input: { branchId?: string | null } = {}) {
  const supabase = createAdminSupabaseClient() as any;
  const permissionContext = await getStaffEffectivePermissions(session);
  const branchId = input.branchId?.trim() || null;

  await assertTelegramBranchScope(supabase, session, branchId);

  const now = new Date().toISOString();
  let revokeQuery = supabase
    .from("telegram_connection_tokens")
    .update({ revoked_at: now })
    .eq("restaurant_id", session.restaurantId)
    .eq("user_id", session.userId)
    .is("consumed_at", null)
    .is("revoked_at", null);
  revokeQuery = branchId ? revokeQuery.eq("branch_id", branchId) : revokeQuery.is("branch_id", null);
  const revokeResult = await revokeQuery;
  if (revokeResult.error) throw revokeResult.error;

  const token = createSignedToken(connectSecret());
  const expiresAt = new Date(Date.now() + tokenTtlSeconds() * 1000).toISOString();
  const { error } = await supabase.from("telegram_connection_tokens").insert({
    token_hash: tokenHash(token),
    restaurant_id: session.restaurantId,
    branch_id: branchId,
    user_id: session.userId,
    role: session.role,
    permissions: permissionContext.permissions,
    expires_at: expiresAt,
    created_by: session.userId,
    metadata: {
      source: "dashboard",
      roleCode: permissionContext.roleCode,
      staffMemberId: permissionContext.staffMemberId
    }
  });
  if (error) throw error;

  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  return {
    token,
    expiresAt,
    startUrl: botUsername ? `https://t.me/${botUsername}?start=${encodeURIComponent(token)}` : null,
    startCommand: `/start ${token}`
  };
}

export async function sendTelegramTestNotification(session: SessionProfile, input: TelegramTestNotificationInput = {}) {
  const supabase = createAdminSupabaseClient() as any;
  const branchId = input.branchId?.trim() || null;
  const kind = normalizeTelegramTestKind(input.kind);

  await assertTelegramBranchScope(supabase, session, branchId);

  const activeConnectionCount = await countActiveTelegramConnections(supabase, session.restaurantId, branchId);
  if (activeConnectionCount === 0) {
    throw new AppError("Chưa có kết nối Telegram hoạt động cho phạm vi này.", 409);
  }

  const event = buildTelegramTestEvent(session, branchId, kind);
  const job = await enqueueTelegramQueueJob(event, {
    jobId: `${TELEGRAM_QUEUE_NAME}:test:${session.restaurantId}:${kind}:${Date.now()}`,
    attempts: 3
  });

  await supabase.from("telegram_audit_logs").insert({
    restaurant_id: session.restaurantId,
    branch_id: branchId,
    user_id: session.userId,
    action: "telegram.test_notification.send",
    entity_type: "telegram_notification",
    outcome: "accepted",
    metadata: {
      eventId: event.eventId,
      eventType: event.type,
      kind,
      job
    }
  });

  return {
    queued: true,
    kind,
    eventId: event.eventId,
    eventType: event.type,
    job
  };
}

export async function getTelegramOperationsStatus(session: SessionProfile) {
  const supabase = createAdminSupabaseClient() as any;
  const restaurantId = session.restaurantId;

  const [connectionsResult, recentNotificationsResult, recentAuditResult, failedCountResult, queueHealth, policyStatus, incidentStatus] = await Promise.all([
    supabase
      .from("telegram_connections")
      .select("id,branch_id,user_id,telegram_username,telegram_first_name,telegram_last_name,role,status,connected_at,last_seen_at")
      .eq("restaurant_id", restaurantId)
      .order("connected_at", { ascending: false })
      .limit(10),
    supabase
      .from("telegram_notifications")
      .select("id,event_type,status,title,sent_at,failed_at,last_error,created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("telegram_audit_logs")
      .select("id,action,outcome,entity_type,entity_id,created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("telegram_notifications")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .in("status", ["failed", "rate_limited"]),
    getTelegramQueueHealth(),
    getTelegramNotificationPolicies(session),
    getTelegramIncidentStatus(supabase, session)
  ]);

  if (connectionsResult.error) throw connectionsResult.error;
  if (recentNotificationsResult.error) throw recentNotificationsResult.error;
  if (recentAuditResult.error) throw recentAuditResult.error;
  if (failedCountResult.error) throw failedCountResult.error;

  const connections = (connectionsResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    branchId: row.branch_id ? String(row.branch_id) : null,
    userId: String(row.user_id),
    username: row.telegram_username ? String(row.telegram_username) : null,
    displayName: [row.telegram_first_name, row.telegram_last_name].filter(Boolean).join(" ") || row.telegram_username || "Telegram user",
    role: row.role === "ADMIN" ? "ADMIN" : "STAFF",
    status: String(row.status ?? "active"),
    connectedAt: String(row.connected_at),
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null
  }));

  const recentNotifications = (recentNotificationsResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    status: String(row.status),
    title: String(row.title),
    sentAt: row.sent_at ? String(row.sent_at) : null,
    failedAt: row.failed_at ? String(row.failed_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at)
  }));

  const recentAuditLogs = (recentAuditResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    action: String(row.action),
    outcome: String(row.outcome),
    entityType: row.entity_type ? String(row.entity_type) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    createdAt: String(row.created_at)
  }));
  const activeConnectionCount = connections.filter((connection: { status: string }) => connection.status === "active").length;
  const bot = getTelegramBotIntegrationStatus();
  const failedNotificationCount = failedCountResult.count ?? 0;

  return {
    connected: connections.some((connection: { status: string }) => connection.status === "active"),
    activeConnectionCount,
    failedNotificationCount,
    bot,
    setup: buildTelegramSetupStatus({
      activeConnectionCount,
      botConfigured: bot.configured,
      queueAvailable: queueHealth.available,
      failedNotificationCount,
      policyReady: policyStatus.schemaReady,
      activePolicyCount: policyStatus.enabledCount,
      openIncidentCount: incidentStatus.openCount
    }),
    policies: policyStatus,
    incidents: incidentStatus,
    queue: queueHealth,
    connections,
    recentNotifications,
    recentAuditLogs
  };
}

export async function getTelegramNotificationPolicies(session: SessionProfile) {
  const supabase = createAdminSupabaseClient() as any;
  const defaults = defaultPolicyViews();

  const result = await supabase
    .from("telegram_notification_policies")
    .select("id,event_type,label,branch_id,enabled,recipient_scope,required_permission,priority,escalation_after_seconds,escalate_to_admin,digest_enabled,updated_at")
    .eq("restaurant_id", session.restaurantId)
    .order("priority", { ascending: true })
    .order("label", { ascending: true });

  if (isMissingTelegramOpsSchema(result.error)) {
    return summarizeTelegramPolicies(defaults, false);
  }
  if (result.error) throw result.error;

  const rows = result.data ?? [];
  if (rows.length === 0) {
    const seeded = await seedDefaultTelegramNotificationPolicies(supabase, session);
    return summarizeTelegramPolicies(seeded.length ? seeded : defaults, true);
  }

  return summarizeTelegramPolicies(rows.map(normalizeTelegramPolicyRow), true);
}

export async function updateTelegramNotificationPolicy(session: SessionProfile, input: TelegramNotificationPolicyInput) {
  const supabase = createAdminSupabaseClient() as any;
  const branchId = input.branchId?.trim() || null;
  await assertTelegramBranchScope(supabase, session, branchId);

  const defaultsByType: Map<string, (typeof TELEGRAM_DEFAULT_POLICIES)[number]> = new Map(
    TELEGRAM_DEFAULT_POLICIES.map((policy) => [policy.eventType, policy])
  );
  const fallback = defaultsByType.get(input.eventType);
  const patch = {
    enabled: input.enabled,
    recipient_scope: input.recipientScope,
    priority: input.priority,
    escalation_after_seconds: input.escalationAfterSeconds,
    digest_enabled: input.digestEnabled
  };
  const row = compactObject({
    restaurant_id: session.restaurantId,
    branch_id: branchId,
    event_type: input.eventType,
    label: fallback?.label ?? input.eventType,
    required_permission: fallback?.requiredPermission ?? requiredPermissionForEventType(input.eventType),
    recipient_scope: patch.recipient_scope ?? "permission",
    priority: patch.priority ?? fallback?.priority ?? 5,
    escalation_after_seconds: patch.escalation_after_seconds ?? fallback?.escalationAfterSeconds ?? null,
    digest_enabled: patch.digest_enabled ?? false,
    created_by: session.userId,
    metadata: { source: "dashboard" }
  });

  const existingQuery = supabase
    .from("telegram_notification_policies")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("event_type", input.eventType);
  const existingResult = branchId ? await existingQuery.eq("branch_id", branchId).maybeSingle() : await existingQuery.is("branch_id", null).maybeSingle();

  if (isMissingTelegramOpsSchema(existingResult.error)) {
    throw new AppError("Chưa apply migration Telegram Ops policy.", 500);
  }
  if (existingResult.error) throw existingResult.error;

  const result = existingResult.data
    ? await supabase
        .from("telegram_notification_policies")
        .update({ ...compactObject(patch), updated_at: new Date().toISOString() })
        .eq("id", existingResult.data.id)
        .select("id,event_type,label,branch_id,enabled,recipient_scope,required_permission,priority,escalation_after_seconds,escalate_to_admin,digest_enabled,updated_at")
        .single()
    : await supabase
        .from("telegram_notification_policies")
        .insert(row)
        .select("id,event_type,label,branch_id,enabled,recipient_scope,required_permission,priority,escalation_after_seconds,escalate_to_admin,digest_enabled,updated_at")
        .single();
  if (result.error) throw result.error;

  await supabase.from("telegram_audit_logs").insert({
    restaurant_id: session.restaurantId,
    branch_id: branchId,
    user_id: session.userId,
    action: "telegram.policy.update",
    entity_type: "telegram_notification_policy",
    entity_id: result.data.id,
    outcome: "accepted",
    metadata: {
      eventType: input.eventType,
      patch: compactObject(patch)
    }
  });

  return normalizeTelegramPolicyRow(result.data);
}

export async function recordTelegramOwnerBriefing(input: TelegramOwnerBriefingInput) {
  const now = new Date();
  const periodStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const periodEnd = new Date(periodStart.getTime() + 3_600_000);
  const branchId = input.branchId?.trim() || null;
  const scopeKey = branchId ? `branch:${branchId}` : "restaurant";
  const periodKey = periodStart.toISOString().slice(0, 13).replace(/[-T:]/g, "");
  const briefingKey = `telegram.${input.command}.${scopeKey}.${periodKey}`;
  const supabase = createAdminSupabaseClient() as any;

  const result = await supabase
    .from("telegram_owner_briefings")
    .upsert(
      {
        restaurant_id: input.restaurantId,
        branch_id: branchId,
        briefing_key: briefingKey,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        status: "generated",
        title: telegramBriefingTitle(input.command, input.intentLabel),
        summary: sanitizeTelegramBriefingText(input.reply, 700),
        metrics: {
          source: "telegram",
          command: input.command,
          intent: input.intent,
          actorRole: input.actorRole,
          actionCount: input.actions.length,
          replyLength: input.reply.length
        },
        actions: input.actions.map(normalizeTelegramBriefingAction),
        provider: input.provider,
        model: input.model
      },
      { onConflict: "restaurant_id,briefing_key" }
    )
    .select("id,status,created_at")
    .single();

  if (isMissingTelegramOpsSchema(result.error)) {
    return { schemaReady: false, id: null, status: null };
  }
  if (result.error) throw result.error;

  return {
    schemaReady: true,
    id: String(result.data.id),
    status: String(result.data.status),
    createdAt: String(result.data.created_at)
  };
}

export async function retryTelegramNotifications(
  session: SessionProfile,
  input: { notificationId?: string | null; limit?: number } = {}
) {
  const supabase = createAdminSupabaseClient() as any;
  const rows = await getRetryableTelegramNotifications(supabase, session, input);
  if (rows.length === 0) return { queued: 0, skipped: 0, jobs: [] };

  const jobs = [];
  let skipped = 0;
  for (const row of rows) {
    const event = normalizeNotificationPayload(row);
    if (!event) {
      skipped += 1;
      await recordTelegramRetryAudit(supabase, session, row, "failed", { reason: "invalid_notification_payload" });
      continue;
    }

    const job = await enqueueTelegramRetryJob(row.id, event);
    const updateResult = await supabase
      .from("telegram_notifications")
      .update({
        status: "queued",
        attempts: Number(row.attempts ?? 0) + 1,
        scheduled_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id)
      .eq("restaurant_id", session.restaurantId);
    if (updateResult.error) throw updateResult.error;

    await recordTelegramRetryAudit(supabase, session, row, "accepted", { job });
    jobs.push(job);
  }

  return { queued: jobs.length, skipped, jobs };
}

export async function revokeTelegramConnection(session: SessionProfile, input: { connectionId: string }) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const { data: connection, error } = await supabase
    .from("telegram_connections")
    .update({
      status: "revoked",
      revoked_at: now,
      updated_at: now
    })
    .eq("id", input.connectionId)
    .eq("restaurant_id", session.restaurantId)
    .neq("status", "revoked")
    .select("id,branch_id,user_id,telegram_user_id")
    .maybeSingle();

  if (error) throw error;
  if (!connection) throw new AppError("Không tìm thấy kết nối Telegram cần ngắt.", 404);

  const revokeCallbacksResult = await supabase
    .from("telegram_callback_actions")
    .update({ status: "revoked" })
    .eq("restaurant_id", session.restaurantId)
    .eq("connection_id", input.connectionId)
    .eq("status", "pending")
    .is("used_at", null);
  if (revokeCallbacksResult.error) throw revokeCallbacksResult.error;

  await supabase.from("telegram_audit_logs").insert({
    restaurant_id: session.restaurantId,
    branch_id: connection.branch_id ?? null,
    connection_id: connection.id,
    user_id: session.userId,
    telegram_user_id: connection.telegram_user_id ?? null,
    action: "telegram.connection.revoke",
    entity_type: "telegram_connection",
    entity_id: connection.id,
    outcome: "accepted",
    metadata: {
      revokedBy: session.userId,
      targetUserId: connection.user_id
    }
  });

  return { revoked: true, connectionId: connection.id };
}

export function assertInternalApiKey(request: Request) {
  const expected = process.env.LOGIVN_INTERNAL_API_KEY;
  const provided = request.headers.get("x-logivn-internal-key") || request.headers.get("x-api-key");
  if (!expected) throw new AppError("Thiếu LOGIVN_INTERNAL_API_KEY.", 500);
  if (!provided || !safeEqual(provided, expected)) throw new AppError("Không có quyền gọi internal API.", 401);
}

function createSignedToken(secret: string) {
  const nonce = randomBytes(18).toString("base64url");
  const signature = createHmac("sha256", secret).update(nonce).digest("base64url").slice(0, SIGNATURE_LENGTH);
  return `${TOKEN_PREFIX}_${nonce}${signature}`;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function connectSecret() {
  const secret = process.env.TELEGRAM_CONNECT_TOKEN_SECRET || process.env.TELEGRAM_CALLBACK_SECRET;
  if (!secret) throw new AppError("Thiếu TELEGRAM_CONNECT_TOKEN_SECRET hoặc TELEGRAM_CALLBACK_SECRET.", 500);
  return secret;
}

function tokenTtlSeconds() {
  const parsed = Number(process.env.TELEGRAM_CONNECT_TOKEN_TTL_SECONDS || "600");
  return Number.isFinite(parsed) && parsed >= 60 ? parsed : 600;
}

function safeEqual(a: string, b: string) {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

async function getRetryableTelegramNotifications(
  supabase: any,
  session: SessionProfile,
  input: { notificationId?: string | null; limit?: number }
) {
  let query = supabase
    .from("telegram_notifications")
    .select("id,event_id,event_type,restaurant_id,branch_id,connection_id,status,payload,attempts,title,last_error,created_at")
    .eq("restaurant_id", session.restaurantId)
    .in("status", RETRYABLE_NOTIFICATION_STATUSES)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(input.limit ?? 25, 1), 50));

  if (input.notificationId) query = query.eq("id", input.notificationId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function normalizeNotificationPayload(row: any): OperationalEvent | null {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  if (payload.restaurantId !== row.restaurant_id) return null;
  if (typeof payload.type !== "string" || typeof payload.eventId !== "string") return null;
  return {
    ...payload,
    eventId: row.event_id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id ?? payload.branchId ?? null,
    tenantId: row.restaurant_id,
    occurredAt: new Date().toISOString()
  } as OperationalEvent;
}

async function enqueueTelegramRetryJob(notificationId: string, event: OperationalEvent) {
  return enqueueTelegramQueueJob(event, {
    jobId: `${TELEGRAM_QUEUE_NAME}:retry:${notificationId}:${Date.now()}`,
    attempts: 5,
    notificationId
  });
}

async function enqueueTelegramQueueJob(
  event: OperationalEvent,
  input: { jobId: string; attempts: number; notificationId?: string | null }
) {
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY;
  if (!gatewayUrl || !internalKey) {
    throw new AppError("Thiếu LOGIVN_API_INTERNAL_URL hoặc LOGIVN_INTERNAL_API_KEY cho Telegram queue.", 500);
  }

  const response = await fetch(new URL("/queues/jobs", gatewayUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify({
      queueName: TELEGRAM_QUEUE_NAME,
      name: event.type,
      data: event,
      priority: "high",
      opts: {
        jobId: input.jobId,
        attempts: input.attempts
      }
    }),
    signal: AbortSignal.timeout(1500)
  }).catch((error) => {
    throw new AppError(`Không gửi được retry job Telegram: ${error instanceof Error ? error.message : "request_failed"}`, 502);
  });

  const body = (await response.json().catch(() => ({}))) as { jobId?: string; queueName?: string; error?: string };
  if (!response.ok) throw new AppError(body.error ?? "Gateway từ chối retry job Telegram.", response.status);
  return {
    queueName: body.queueName ?? TELEGRAM_QUEUE_NAME,
    jobId: body.jobId ?? null,
    notificationId: input.notificationId ?? null,
    eventId: event.eventId,
    eventType: event.type
  };
}

async function getTelegramQueueHealth() {
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY;
  if (!gatewayUrl || !internalKey) {
    return {
      available: false,
      reason: "missing_gateway_config",
      queueName: TELEGRAM_QUEUE_NAME,
      dlqName: TELEGRAM_DLQ_NAME,
      counts: null,
      deadLetterCounts: null,
      backlog: 0,
      deadLetters: 0,
      failedJobs: [],
      deadLetterJobs: []
    };
  }

  try {
    const [queues, failed, deadLetters] = await Promise.all([
      gatewayGet<{ queues?: Record<string, QueueCounts> }>("/queues", gatewayUrl, internalKey),
      gatewayGet<{ jobs?: GatewayFailedJob[] }>(
        `/queues/failed?queueName=${encodeURIComponent(TELEGRAM_QUEUE_NAME)}&limit=5`,
        gatewayUrl,
        internalKey
      ),
      gatewayGet<{ jobs?: GatewayFailedJob[] }>(
        `/queues/failed?queueName=${encodeURIComponent(TELEGRAM_DLQ_NAME)}&limit=5`,
        gatewayUrl,
        internalKey
      )
    ]);

    const counts = normalizeQueueCounts(queues.queues?.[TELEGRAM_QUEUE_NAME]);
    const deadLetterCounts = normalizeQueueCounts(queues.queues?.[TELEGRAM_DLQ_NAME]);

    return {
      available: true,
      queueName: TELEGRAM_QUEUE_NAME,
      dlqName: TELEGRAM_DLQ_NAME,
      counts,
      deadLetterCounts,
      backlog: queueBacklog(counts),
      deadLetters: queueBacklog(deadLetterCounts) + deadLetterCounts.failed,
      failedJobs: normalizeGatewayJobs(failed.jobs ?? []),
      deadLetterJobs: normalizeGatewayJobs(deadLetters.jobs ?? [])
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "gateway_unavailable",
      queueName: TELEGRAM_QUEUE_NAME,
      dlqName: TELEGRAM_DLQ_NAME,
      counts: null,
      deadLetterCounts: null,
      backlog: 0,
      deadLetters: 0,
      failedJobs: [],
      deadLetterJobs: []
    };
  }
}

async function gatewayGet<T>(path: string, gatewayUrl: string, internalKey: string): Promise<T> {
  const response = await fetch(new URL(path, gatewayUrl), {
    headers: {
      "x-logivn-internal-key": internalKey
    },
    signal: AbortSignal.timeout(1500),
    cache: "no-store"
  });

  const body = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!response.ok || body.ok === false) {
    throw new AppError(body.error ?? "Không đọc được BullMQ gateway.", response.status || 502);
  }
  return body;
}

function normalizeQueueCounts(input?: QueueCounts | null) {
  return {
    waiting: safeCount(input?.waiting),
    active: safeCount(input?.active),
    delayed: safeCount(input?.delayed),
    failed: safeCount(input?.failed),
    completed: safeCount(input?.completed),
    paused: safeCount(input?.paused)
  };
}

function queueBacklog(counts: ReturnType<typeof normalizeQueueCounts>) {
  return counts.waiting + counts.active + counts.delayed + counts.paused;
}

function normalizeGatewayJobs(jobs: GatewayFailedJob[]) {
  return jobs.slice(0, 5).map((job) => ({
    id: job.id == null ? null : String(job.id),
    name: job.name ? String(job.name) : null,
    attemptsMade: safeCount(job.attemptsMade),
    failedReason: job.failedReason ? String(job.failedReason).slice(0, 240) : null,
    failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null
  }));
}

function safeCount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function compactObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

async function seedDefaultTelegramNotificationPolicies(supabase: any, session: SessionProfile) {
  const rows = TELEGRAM_DEFAULT_POLICIES.map((policy) => ({
    restaurant_id: session.restaurantId,
    branch_id: null,
    event_type: policy.eventType,
    label: policy.label,
    enabled: true,
    recipient_scope: "permission",
    required_permission: policy.requiredPermission,
    priority: policy.priority,
    escalation_after_seconds: policy.escalationAfterSeconds,
    escalate_to_admin: true,
    digest_enabled: false,
    created_by: session.userId,
    metadata: { seededBy: "telegram_status" }
  }));

  const result = await supabase
    .from("telegram_notification_policies")
    .insert(rows)
    .select("id,event_type,label,branch_id,enabled,recipient_scope,required_permission,priority,escalation_after_seconds,escalate_to_admin,digest_enabled,updated_at");
  if (isMissingTelegramOpsSchema(result.error)) return [];
  if (result.error) throw result.error;
  return (result.data ?? []).map(normalizeTelegramPolicyRow);
}

function normalizeTelegramPolicyRow(row: any) {
  return {
    id: row.id ? String(row.id) : null,
    eventType: String(row.event_type),
    label: String(row.label ?? row.event_type),
    branchId: row.branch_id ? String(row.branch_id) : null,
    enabled: Boolean(row.enabled),
    recipientScope: normalizeRecipientScope(row.recipient_scope),
    requiredPermission: row.required_permission ? String(row.required_permission) : null,
    priority: safePolicyPriority(row.priority),
    escalationAfterSeconds: row.escalation_after_seconds == null ? null : safeCount(row.escalation_after_seconds),
    escalateToAdmin: row.escalate_to_admin !== false,
    digestEnabled: Boolean(row.digest_enabled),
    updatedAt: row.updated_at ? String(row.updated_at) : null
  };
}

function defaultPolicyViews() {
  return TELEGRAM_DEFAULT_POLICIES.map((policy) => ({
    id: null,
    eventType: policy.eventType,
    label: policy.label,
    branchId: null,
    enabled: true,
    recipientScope: "permission" as TelegramPolicyRecipientScope,
    requiredPermission: policy.requiredPermission,
    priority: policy.priority,
    escalationAfterSeconds: policy.escalationAfterSeconds,
    escalateToAdmin: true,
    digestEnabled: false,
    updatedAt: null
  }));
}

function summarizeTelegramPolicies(policies: ReturnType<typeof normalizeTelegramPolicyRow>[], schemaReady: boolean) {
  const enabledCount = policies.filter((policy) => policy.enabled).length;
  const criticalCount = policies.filter((policy) => policy.enabled && policy.priority <= 2).length;
  return {
    schemaReady,
    total: policies.length,
    enabledCount,
    criticalCount,
    disabledCount: Math.max(0, policies.length - enabledCount),
    policies
  };
}

async function getTelegramIncidentStatus(supabase: any, session: SessionProfile) {
  const result = await supabase
    .from("telegram_ops_incidents")
    .select("id,severity,area,status,title,summary,last_seen_at")
    .eq("restaurant_id", session.restaurantId)
    .in("status", ["open", "acknowledged"])
    .order("last_seen_at", { ascending: false })
    .limit(5);

  if (isMissingTelegramOpsSchema(result.error)) {
    return { schemaReady: false, openCount: 0, criticalCount: 0, incidents: [] };
  }
  if (result.error) throw result.error;

  const incidents = (result.data ?? []).map((row: any) => ({
    id: String(row.id),
    severity: String(row.severity),
    area: String(row.area),
    status: String(row.status),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null
  }));

  return {
    schemaReady: true,
    openCount: incidents.length,
    criticalCount: incidents.filter((incident: { severity: string }) => incident.severity === "critical").length,
    incidents
  };
}

function normalizeRecipientScope(value: unknown): TelegramPolicyRecipientScope {
  return TELEGRAM_POLICY_RECIPIENT_SCOPES.includes(value as TelegramPolicyRecipientScope) ? (value as TelegramPolicyRecipientScope) : "permission";
}

function safePolicyPriority(value: unknown) {
  const parsed = Number(value ?? 5);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10, Math.trunc(parsed))) : 5;
}

function requiredPermissionForEventType(eventType: string) {
  if (eventType.startsWith("payment.")) return "payments.confirm";
  if (eventType.startsWith("reservation.")) return "reservations.manage";
  if (eventType.startsWith("inventory.")) return "inventory.view";
  if (eventType.startsWith("menu.")) return "menu.edit";
  if (eventType.startsWith("staff.")) return "approvals.review";
  if (eventType.startsWith("platform.")) return "notifications.manage";
  return "orders.update";
}

function telegramBriefingTitle(command: TelegramOwnerBriefingInput["command"], intentLabel?: string) {
  if (command === "doanhthu") return "Brief doanh thu";
  if (command === "tonkho") return "Brief tồn kho";
  if (command === "tinhhinh") return "Brief tình hình vận hành";
  return intentLabel ? `Brief ${intentLabel}` : "Brief AI Ops";
}

function normalizeTelegramBriefingAction(action: AiAgentAction) {
  return {
    id: action.id,
    type: action.type,
    label: sanitizeTelegramBriefingText(action.label, 80),
    description: action.description ? sanitizeTelegramBriefingText(action.description, 180) : null,
    href: action.href?.startsWith("/dashboard") ? action.href.slice(0, 180) : null,
    endpoint: action.endpoint?.startsWith("/api/admin") ? action.endpoint.slice(0, 180) : null,
    priority: action.priority ?? null,
    safety: action.safety ?? null,
    intent: action.intent ?? null
  };
}

function sanitizeTelegramBriefingText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

async function recordTelegramRetryAudit(
  supabase: any,
  session: SessionProfile,
  row: any,
  outcome: "accepted" | "failed",
  metadata: Record<string, unknown>
) {
  await supabase.from("telegram_audit_logs").insert({
    restaurant_id: session.restaurantId,
    branch_id: row.branch_id ?? null,
    connection_id: row.connection_id ?? null,
    user_id: session.userId,
    action: "telegram.notification.retry",
    entity_type: "telegram_notification",
    entity_id: row.id,
    outcome,
    metadata: {
      eventId: row.event_id,
      eventType: row.event_type,
      previousStatus: row.status,
      ...metadata
    }
  });
}

function internalGatewayUrl() {
  return process.env.LOGIVN_API_INTERNAL_URL || process.env.LOGIVN_API_PUBLIC_URL || "";
}

function getTelegramBotIntegrationStatus() {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || null;
  const connectSecretConfigured = Boolean(process.env.TELEGRAM_CONNECT_TOKEN_SECRET || process.env.TELEGRAM_CALLBACK_SECRET);
  const callbackSecretConfigured = Boolean(process.env.TELEGRAM_CALLBACK_SECRET);
  const connectTtlSecondsValue = tokenTtlSeconds();
  return {
    mode: "logivn_managed_bot",
    configured: Boolean(username && connectSecretConfigured && callbackSecretConfigured),
    username: username ? `@${username}` : null,
    startUrl: username ? `https://t.me/${username}` : null,
    connectTtlSeconds: connectTtlSecondsValue,
    canCreateBotAutomatically: false,
    diagnostics: {
      usernameConfigured: Boolean(username),
      connectSecretConfigured,
      callbackSecretConfigured
    }
  };
}

function buildTelegramSetupStatus({
  activeConnectionCount,
  botConfigured,
  queueAvailable,
  failedNotificationCount,
  policyReady,
  activePolicyCount,
  openIncidentCount
}: {
  activeConnectionCount: number;
  botConfigured: boolean;
  queueAvailable: boolean;
  failedNotificationCount: number;
  policyReady: boolean;
  activePolicyCount: number;
  openIncidentCount: number;
}) {
  const connected = activeConnectionCount > 0;
  const ready = botConfigured && queueAvailable && connected && policyReady && failedNotificationCount === 0 && openIncidentCount === 0;
  return {
    state: ready ? "ready" : connected ? "connected" : botConfigured && queueAvailable ? "ready_to_connect" : "needs_attention",
    steps: [
      {
        key: "managed_bot",
        label: "Bot LogiVN",
        status: botConfigured ? "done" : "warning",
        detail: botConfigured ? "Đã provision" : "Thiếu username/secret"
      },
      {
        key: "secure_link",
        label: "Link tích hợp",
        status: connected ? "done" : "pending",
        detail: "Token có hạn"
      },
      {
        key: "account_mapping",
        label: "Tài khoản Telegram",
        status: connected ? "done" : "pending",
        detail: connected ? `${activeConnectionCount} đang hoạt động` : "Chưa nối"
      },
      {
        key: "delivery_pipeline",
        label: "Luồng gửi tin",
        status: queueAvailable ? "done" : "warning",
        detail: queueAvailable ? "BullMQ online" : "Gateway lỗi"
      },
      {
        key: "notification_policy",
        label: "Rule tự động",
        status: policyReady && activePolicyCount > 0 ? "done" : "warning",
        detail: policyReady ? `${activePolicyCount} rule đang bật` : "Chưa apply policy schema"
      },
      {
        key: "test_delivery",
        label: "Kiểm thử",
        status: failedNotificationCount > 0 || openIncidentCount > 0 ? "warning" : connected ? "done" : "pending",
        detail:
          failedNotificationCount > 0
            ? `${failedNotificationCount} lỗi gửi`
            : openIncidentCount > 0
              ? `${openIncidentCount} incident mở`
              : connected
                ? "Sẵn sàng"
                : "Chờ kết nối"
      }
    ]
  };
}

function isMissingTelegramOpsSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /telegram_(notification_policies|ops_incidents|owner_briefings)/i.test(error.message ?? "")
  );
}

async function assertTelegramBranchScope(supabase: any, session: SessionProfile, branchId: string | null) {
  if (!branchId) return;
  const { data: branch, error } = await supabase
    .from("store_branches")
    .select("id")
    .eq("id", branchId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  if (error) throw error;
  if (!branch) throw new AppError("Chi nhánh Telegram không thuộc quán hiện tại.", 403);
}

async function countActiveTelegramConnections(supabase: any, restaurantId: string, branchId: string | null) {
  let query = supabase
    .from("telegram_connections")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("status", "active");

  if (branchId) query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function normalizeTelegramTestKind(kind: TelegramTestNotificationInput["kind"]): TelegramTestNotificationKind {
  return kind && TELEGRAM_TEST_NOTIFICATION_KINDS.includes(kind) ? kind : "order";
}

function buildTelegramTestEvent(session: SessionProfile, branchId: string | null, kind: TelegramTestNotificationKind): OperationalEvent {
  const now = new Date();
  const base = {
    eventId: `telegram.test:${kind}:${randomUUID()}`,
    restaurantId: session.restaurantId,
    tenantId: session.restaurantId,
    branchId,
    occurredAt: now.toISOString()
  };

  if (kind === "payment") {
    return {
      ...base,
      type: "payment.waiting_confirm",
      payment: {
        orderId: randomUUID(),
        billId: randomUUID(),
        amount: 245000,
        method: "QR",
        customerName: "Khách test LogiVN"
      }
    };
  }

  if (kind === "reservation") {
    return {
      ...base,
      type: "reservation.created",
      reservation: {
        id: randomUUID(),
        startsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        partySize: 4,
        customerName: "Khách đặt bàn test",
        depositRequiredAmount: 100000
      }
    };
  }

  if (kind === "inventory") {
    return {
      ...base,
      type: "inventory.low",
      inventory: {
        items: ["Matcha test", "Sữa tươi test", "Trân châu test"]
      }
    };
  }

  if (kind === "menu") {
    return {
      ...base,
      type: "menu.item_availability_suggested",
      menuItem: {
        id: randomUUID(),
        name: "Món test cần tạm ẩn",
        currentAvailable: true,
        suggestedAvailable: false,
        reason: "Nguyên liệu chính đang dưới định mức."
      }
    };
  }

  if (kind === "sla") {
    return {
      ...base,
      type: "sla.warning",
      sla: {
        orderId: randomUUID(),
        displayCode: "TEST-SLA",
        lateMinutes: 15
      }
    };
  }

  if (kind === "service") {
    return {
      ...base,
      type: "service_request.created",
      serviceRequest: {
        id: randomUUID(),
        tableId: randomUUID(),
        tableName: "Bàn test",
        type: "CALL_STAFF",
        message: "Khách cần hỗ trợ test",
        status: "open"
      }
    };
  }

  if (kind === "staff") {
    return {
      ...base,
      type: "staff.request_created",
      staffRequest: {
        id: randomUUID(),
        requestType: "shift_swap",
        staffMemberId: randomUUID(),
        staffName: "Nhân sự test",
        status: "pending",
        reason: "Xin đổi ca tối nay",
        requestedPayload: {
          shiftName: "Ca tối",
          scheduledDate: now.toISOString().slice(0, 10)
        }
      }
    };
  }

  return {
    ...base,
    type: "order.created",
    order: {
      id: randomUUID(),
      displayCode: "TEST-1025",
      itemCount: 3,
      total: 245000,
      tableName: "Bàn test",
      fulfillmentType: "DINE_IN",
      customerName: "Khách test LogiVN"
    }
  };
}
