import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStaffEffectivePermissions } from "@/services/staff-permission-service";
import type { OperationalEvent } from "@/services/operational-event-bus";
import type { SessionProfile } from "@/types/domain";

const TOKEN_PREFIX = "lg1";
const SIGNATURE_LENGTH = 12;
const TELEGRAM_QUEUE_NAME = "telegram.notifications";
const TELEGRAM_DLQ_NAME = `${TELEGRAM_QUEUE_NAME}.dlq`;
const RETRYABLE_NOTIFICATION_STATUSES = ["failed", "rate_limited"] as const;

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

export async function createTelegramConnectionToken(session: SessionProfile, input: { branchId?: string | null } = {}) {
  const supabase = createAdminSupabaseClient() as any;
  const permissionContext = await getStaffEffectivePermissions(session);
  const branchId = input.branchId?.trim() || null;

  if (branchId) {
    const { data: branch, error } = await supabase
      .from("store_branches")
      .select("id")
      .eq("id", branchId)
      .eq("restaurant_id", session.restaurantId)
      .maybeSingle();
    if (error) throw error;
    if (!branch) throw new AppError("Chi nhánh Telegram không thuộc quán hiện tại.", 403);
  }

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
    startUrl: botUsername ? `https://t.me/${botUsername}?start=${encodeURIComponent(token)}` : null
  };
}

export async function getTelegramOperationsStatus(session: SessionProfile) {
  const supabase = createAdminSupabaseClient() as any;
  const restaurantId = session.restaurantId;

  const [connectionsResult, recentNotificationsResult, recentAuditResult, failedCountResult, queueHealth] = await Promise.all([
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
    getTelegramQueueHealth()
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

  return {
    connected: connections.some((connection: { status: string }) => connection.status === "active"),
    activeConnectionCount: connections.filter((connection: { status: string }) => connection.status === "active").length,
    failedNotificationCount: failedCountResult.count ?? 0,
    queue: queueHealth,
    connections,
    recentNotifications,
    recentAuditLogs
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
  return `${TOKEN_PREFIX}_${nonce}.${signature}`;
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
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
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
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY;
  if (!gatewayUrl || !internalKey) {
    throw new AppError("Thiếu LOGIVN_API_INTERNAL_URL hoặc LOGIVN_INTERNAL_API_KEY để retry Telegram.", 500);
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
        jobId: `${TELEGRAM_QUEUE_NAME}:retry:${notificationId}:${Date.now()}`,
        attempts: 5
      }
    }),
    signal: AbortSignal.timeout(1500)
  }).catch((error) => {
    throw new AppError(`Không gửi được retry job Telegram: ${error instanceof Error ? error.message : "request_failed"}`, 502);
  });

  const body = (await response.json().catch(() => ({}))) as { jobId?: string; queueName?: string; error?: string };
  if (!response.ok) throw new AppError(body.error ?? "Gateway từ chối retry job Telegram.", response.status);
  return { queueName: body.queueName ?? TELEGRAM_QUEUE_NAME, jobId: body.jobId ?? null, notificationId };
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
