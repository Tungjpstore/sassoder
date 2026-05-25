import { readEnv, requiredEnv } from "../shared/env.js";
import { supabaseAdmin } from "../shared/supabase.js";
import { assertSignedToken, createSignedToken, tokenHash } from "./crypto.mjs";
import { requiredPermissionByAction, type CallbackActionRecord, type TelegramActionType, type TelegramConnection } from "./types.mjs";

type RecipientQuery = {
  restaurantId: string;
  branchId?: string | null;
  requiredPermission?: string;
};

type NotificationInput = {
  eventId: string;
  eventType: string;
  restaurantId: string;
  branchId?: string | null;
  connection: TelegramConnection;
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

type CallbackActionInput = {
  actionType: TelegramActionType;
  restaurantId: string;
  branchId?: string | null;
  connectionId: string;
  notificationId?: string | null;
  resourceType: string;
  resourceId: string;
  payload?: Record<string, unknown>;
};

type TelegramIdentity = {
  telegramUserId: number;
  chatId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type TelegramSessionInput = {
  connection: TelegramConnection;
  state: "idle" | "awaiting_input" | "ai_ops" | "staff_flow";
  payload: Record<string, unknown>;
  ttlSeconds?: number;
};

const legacyPermissionFallbacks: Record<string, string[]> = {
  "dashboard.view": ["orders.manage", "settings.manage"],
  "orders.view": ["orders.manage"],
  "orders.update": ["orders.manage"],
  "orders.cancel": ["orders.manage"],
  "payments.view": ["payments.manage"],
  "payments.confirm": ["payments.manage"],
  "reports.view": ["orders.manage", "payments.manage", "settings.manage"],
  "reservations.manage": ["settings.manage"],
  "inventory.view": ["inventory.manage"],
  "notifications.manage": ["settings.manage"]
};

export async function getTelegramRecipients(input: RecipientQuery): Promise<TelegramConnection[]> {
  let query = db()
    .from("telegram_connections")
    .select("id,restaurant_id,branch_id,user_id,telegram_user_id,telegram_chat_id,telegram_username,role,permissions,status,restaurant:restaurants(name),branch:store_branches(name)")
    .eq("restaurant_id", input.restaurantId)
    .eq("status", "active");

  if (input.branchId) query = query.or(`branch_id.is.null,branch_id.eq.${input.branchId}`);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map(normalizeConnection)
    .filter((connection: TelegramConnection) => !input.requiredPermission || hasPermission(connection, input.requiredPermission));
}

export async function getTelegramConnectionsForUser(telegramUserId: number): Promise<TelegramConnection[]> {
  const { data, error } = await db()
    .from("telegram_connections")
    .select("id,restaurant_id,branch_id,user_id,telegram_user_id,telegram_chat_id,telegram_username,role,permissions,status,restaurant:restaurants(name),branch:store_branches(name)")
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map(normalizeConnection);
}

export async function getTelegramOpsBoard(connection: TelegramConnection) {
  const restaurantId = connection.restaurant_id;
  const branchId = connection.branch_id;
  const today = vietnamDayWindow();
  const now = new Date().toISOString();

  const [
    openOrders,
    pendingOrders,
    lateOrders,
    waitingPayments,
    openDeliveries,
    todayReservations,
    depositReservations,
    openServiceRequests,
    pendingStaffRequests,
    failedTelegram
  ] = await Promise.all([
    countRows(branchScoped(db().from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("status", ["pending", "ordering", "completed"]), branchId)),
    countRows(branchScoped(db().from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending"), branchId)),
    countRows(branchScoped(db().from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("status", ["pending", "ordering"]).lt("service_due_at", now), branchId)),
    countRows(branchScoped(db().from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("payment_status", ["waiting_payment", "waiting_confirm"]), branchId)),
    countRows(
      branchScoped(
        db()
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("fulfillment_type", "DELIVERY")
          .in("delivery_status", ["requested", "accepted", "out_for_delivery"]),
        branchId
      )
    ),
    countRows(
      db()
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .gte("starts_at", today.start)
        .lt("starts_at", today.end)
        .in("status", ["holding", "waiting_deposit_confirm", "confirmed", "checked_in", "seated"])
    ),
    countRows(
      db()
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .in("deposit_status", ["waiting_payment", "waiting_confirm"])
        .in("status", ["holding", "waiting_deposit_confirm"])
    ),
    countRows(db().from("service_requests").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("status", ["open", "acknowledged"])),
    countRows(branchScoped(db().from("attendance_approval_requests").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending"), branchId)),
    countRows(db().from("telegram_notifications").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("status", ["failed", "rate_limited"]))
  ]);

  return {
    restaurantName: connection.restaurant_name,
    branchName: connection.branch_name,
    scopeLabel: connection.branch_name ?? (branchId ? `CN ${shortId(branchId)}` : "Toàn quán"),
    generatedAt: new Date().toISOString(),
    counts: {
      openOrders,
      pendingOrders,
      lateOrders,
      waitingPayments,
      openDeliveries,
      todayReservations,
      depositReservations,
      openServiceRequests,
      pendingStaffRequests,
      failedTelegram
    }
  };
}

export async function getOrCreateNotification(input: NotificationInput) {
  const row = {
    event_id: input.eventId,
    event_type: input.eventType,
    restaurant_id: input.restaurantId,
    branch_id: input.branchId ?? null,
    connection_id: input.connection.id,
    chat_id: input.connection.telegram_chat_id,
    status: "queued",
    title: input.title,
    body: input.body,
    payload: input.payload,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await db()
    .from("telegram_notifications")
    .insert(row)
    .select("id,status,telegram_message_id")
    .maybeSingle();

  if (!error && data) return data as { id: string; status: string; telegram_message_id: number | null };
  if (error?.code !== "23505") throw error;

  const existing = await db()
    .from("telegram_notifications")
    .select("id,status,telegram_message_id")
    .eq("event_id", input.eventId)
    .eq("connection_id", input.connection.id)
    .single();
  if (existing.error) throw existing.error;
  return existing.data as { id: string; status: string; telegram_message_id: number | null };
}

export async function markNotificationSent(notificationId: string, telegramMessageId: number) {
  const { error } = await db()
    .from("telegram_notifications")
    .update({
      status: "sent",
      telegram_message_id: telegramMessageId,
      sent_at: new Date().toISOString(),
      failed_at: null,
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markNotificationFailed(notificationId: string, errorMessage: string, status: "failed" | "rate_limited" = "failed") {
  const { error } = await db()
    .from("telegram_notifications")
    .update({
      status,
      failed_at: new Date().toISOString(),
      last_error: errorMessage.slice(0, 500),
      updated_at: new Date().toISOString()
    })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function createCallbackAction(input: CallbackActionInput) {
  const secret = callbackSecret();
  const token = createSignedToken(secret);
  const requiredPermission = requiredPermissionByAction[input.actionType];
  const expiresAt = new Date(Date.now() + callbackTtlSeconds() * 1000).toISOString();

  const { error } = await db().from("telegram_callback_actions").insert({
    token_hash: tokenHash(token),
    action_type: input.actionType,
    restaurant_id: input.restaurantId,
    branch_id: input.branchId ?? null,
    connection_id: input.connectionId,
    notification_id: input.notificationId ?? null,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    required_permission: requiredPermission,
    payload: input.payload ?? {},
    expires_at: expiresAt,
    status: "pending"
  });
  if (error) throw error;

  return token;
}

export async function createTelegramSession(input: TelegramSessionInput) {
  const token = createSignedToken(sessionSecret());
  const expiresAt = new Date(Date.now() + sessionTtlSeconds(input.ttlSeconds) * 1000).toISOString();
  const { error } = await db().from("telegram_sessions").insert({
    connection_id: input.connection.id,
    restaurant_id: input.connection.restaurant_id,
    branch_id: input.connection.branch_id,
    session_key_hash: tokenHash(token),
    state: input.state,
    payload: input.payload,
    expires_at: expiresAt
  });
  if (error) throw error;
  return token;
}

export async function claimTelegramSession(token: string, telegramUserId: number) {
  assertSignedToken(token, sessionSecret());
  const hash = tokenHash(token);
  const { data: session, error } = await db()
    .from("telegram_sessions")
    .select("*")
    .eq("session_key_hash", hash)
    .maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("session_not_found");

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await deleteTelegramSession(session.id);
    throw new Error("session_expired");
  }

  const connection = await getConnectionByIdForTelegramUser(session.restaurant_id, session.connection_id, telegramUserId);
  if (!connection) {
    await recordTelegramAudit({
      restaurantId: session.restaurant_id,
      branchId: session.branch_id,
      connectionId: session.connection_id,
      telegramUserId,
      action: "telegram.session.claim",
      outcome: "denied",
      metadata: { reason: "connection_not_authorized", state: session.state }
    });
    throw new Error("session_not_authorized");
  }

  const consumed = await consumeTelegramSession(session.id);
  if (!consumed) throw new Error("session_replayed");

  await recordTelegramAudit({
    restaurantId: session.restaurant_id,
    branchId: session.branch_id,
    connectionId: connection.id,
    userId: connection.user_id,
    telegramUserId,
    action: "telegram.session.claim",
    outcome: "accepted",
    metadata: { state: session.state }
  });

  return {
    session: {
      id: String(session.id),
      state: String(session.state),
      payload: session.payload && typeof session.payload === "object" ? (session.payload as Record<string, unknown>) : {}
    },
    connection
  };
}

export async function claimCallbackAction(token: string, telegramUserId: number) {
  assertSignedToken(token, callbackSecret());
  const now = new Date().toISOString();
  const hash = tokenHash(token);
  const { data: action, error } = await db()
    .from("telegram_callback_actions")
    .select("*")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error) throw error;
  if (!action) throw new Error("callback_not_found");

  const typedAction = action as CallbackActionRecord;
  if (typedAction.status !== "pending" || typedAction.used_at) throw new Error("callback_replayed");
  if (new Date(typedAction.expires_at).getTime() <= Date.now()) {
    await expireCallbackAction(typedAction.id);
    throw new Error("callback_expired");
  }

  const connection = await getConnectionForTelegramUser(typedAction.restaurant_id, telegramUserId);
  if (!connection) {
    await recordTelegramAudit({
      restaurantId: typedAction.restaurant_id,
      branchId: typedAction.branch_id,
      action: typedAction.action_type,
      outcome: "denied",
      telegramUserId,
      metadata: { reason: "telegram_user_not_connected" }
    });
    throw new Error("connection_not_authorized");
  }

  if (typedAction.connection_id && typedAction.connection_id !== connection.id) {
    await recordTelegramAudit({
      restaurantId: typedAction.restaurant_id,
      branchId: typedAction.branch_id,
      connectionId: connection.id,
      userId: connection.user_id,
      telegramUserId,
      action: typedAction.action_type,
      outcome: "denied",
      metadata: { reason: "callback_connection_mismatch", expectedConnectionId: typedAction.connection_id }
    });
    throw new Error("connection_not_authorized");
  }

  if (typedAction.branch_id && connection.branch_id && typedAction.branch_id !== connection.branch_id) {
    await recordTelegramAudit({
      restaurantId: typedAction.restaurant_id,
      branchId: typedAction.branch_id,
      connectionId: connection.id,
      userId: connection.user_id,
      telegramUserId,
      action: typedAction.action_type,
      outcome: "denied",
      metadata: { reason: "branch_scope_mismatch" }
    });
    throw new Error("branch_not_authorized");
  }

  if (!hasPermission(connection, typedAction.required_permission)) {
    await recordTelegramAudit({
      restaurantId: typedAction.restaurant_id,
      branchId: typedAction.branch_id,
      connectionId: connection.id,
      userId: connection.user_id,
      telegramUserId,
      action: typedAction.action_type,
      outcome: "denied",
      metadata: { reason: "permission_denied", requiredPermission: typedAction.required_permission }
    });
    throw new Error("permission_denied");
  }

  const { data: claimed, error: claimError } = await db()
    .from("telegram_callback_actions")
    .update({ status: "used", used_at: now, used_by_telegram_user_id: telegramUserId })
    .eq("id", typedAction.id)
    .eq("status", "pending")
    .is("used_at", null)
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error("callback_replayed");

  await recordTelegramAudit({
    restaurantId: typedAction.restaurant_id,
    branchId: typedAction.branch_id,
    connectionId: connection.id,
    userId: connection.user_id,
    telegramUserId,
    action: typedAction.action_type,
    entityType: typedAction.resource_type,
    entityId: typedAction.resource_id,
    outcome: "accepted"
  });

  return { action: claimed as CallbackActionRecord, connection };
}

export async function connectTelegramAccount(token: string, identity: TelegramIdentity) {
  assertSignedToken(token, connectSecret());
  const now = new Date().toISOString();
  const { data: connectToken, error } = await db()
    .from("telegram_connection_tokens")
    .update({
      consumed_at: now,
      consumed_by_telegram_user_id: identity.telegramUserId
    })
    .eq("token_hash", tokenHash(token))
    .is("consumed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!connectToken) throw new Error("connect_token_used_or_expired");

  const existing = await getConnectionForTelegramUser(connectToken.restaurant_id, identity.telegramUserId);
  if (existing && existing.user_id !== connectToken.user_id) throw new Error("telegram_user_already_connected");

  const connectionPayload = {
    restaurant_id: connectToken.restaurant_id,
    branch_id: connectToken.branch_id ?? null,
    user_id: connectToken.user_id,
    telegram_user_id: identity.telegramUserId,
    telegram_chat_id: identity.chatId,
    telegram_username: identity.username ?? null,
    telegram_first_name: identity.firstName ?? null,
    telegram_last_name: identity.lastName ?? null,
    role: connectToken.role ?? "STAFF",
    permissions: connectToken.permissions ?? [],
    status: "active",
    connected_at: now,
    last_seen_at: now,
    revoked_at: null,
    updated_at: now
  };

  const { data: connection, error: upsertError } = await db()
    .from("telegram_connections")
    .upsert(connectionPayload, { onConflict: "restaurant_id,user_id" })
    .select("*")
    .single();
  if (upsertError) throw upsertError;

  await recordTelegramAudit({
    restaurantId: connectToken.restaurant_id,
    branchId: connectToken.branch_id ?? null,
    connectionId: connection.id,
    userId: connectToken.user_id,
    telegramUserId: identity.telegramUserId,
    action: "telegram.connect",
    outcome: "accepted",
    metadata: { username: identity.username ?? null }
  });

  const connected = await getConnectionByIdForTelegramUser(connectToken.restaurant_id, connection.id, identity.telegramUserId);
  return connected ?? normalizeConnection(connection);
}

export async function touchConnection(restaurantId: string, telegramUserId: number) {
  const { error } = await db()
    .from("telegram_connections")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active");
  if (error) throw error;
}

export async function recordTelegramAudit(input: {
  restaurantId?: string | null;
  branchId?: string | null;
  connectionId?: string | null;
  userId?: string | null;
  telegramUserId?: number | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  outcome: "accepted" | "denied" | "failed" | "sent" | "skipped";
  metadata?: Record<string, unknown>;
}) {
  const { error } = await db().from("telegram_audit_logs").insert({
    restaurant_id: input.restaurantId ?? null,
    branch_id: input.branchId ?? null,
    connection_id: input.connectionId ?? null,
    user_id: input.userId ?? null,
    telegram_user_id: input.telegramUserId ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    outcome: input.outcome,
    metadata: input.metadata ?? {}
  });
  if (error) throw error;
}

export function hasPermission(connection: TelegramConnection, permission: string) {
  if (connection.role === "ADMIN") return true;
  const permissions = new Set(connection.permissions);
  if (permissions.has(permission)) return true;
  return (legacyPermissionFallbacks[permission] ?? []).some((fallback) => permissions.has(fallback));
}

async function getConnectionForTelegramUser(restaurantId: string, telegramUserId: number) {
  const { data, error } = await db()
    .from("telegram_connections")
    .select("id,restaurant_id,branch_id,user_id,telegram_user_id,telegram_chat_id,telegram_username,role,permissions,status,restaurant:restaurants(name),branch:store_branches(name)")
    .eq("restaurant_id", restaurantId)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeConnection(data) : null;
}

async function getConnectionByIdForTelegramUser(restaurantId: string, connectionId: string, telegramUserId: number) {
  const { data, error } = await db()
    .from("telegram_connections")
    .select("id,restaurant_id,branch_id,user_id,telegram_user_id,telegram_chat_id,telegram_username,role,permissions,status,restaurant:restaurants(name),branch:store_branches(name)")
    .eq("id", connectionId)
    .eq("restaurant_id", restaurantId)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeConnection(data) : null;
}

async function expireCallbackAction(id: string) {
  const { error } = await db().from("telegram_callback_actions").update({ status: "expired" }).eq("id", id);
  if (error) throw error;
}

async function deleteTelegramSession(id: string) {
  const { error } = await db().from("telegram_sessions").delete().eq("id", id);
  if (error) throw error;
}

async function consumeTelegramSession(id: string) {
  const { data, error } = await db().from("telegram_sessions").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function normalizeConnection(row: Record<string, unknown>): TelegramConnection {
  const restaurant = normalizeNestedName(row.restaurant);
  const branch = normalizeNestedName(row.branch);
  return {
    id: String(row.id),
    restaurant_id: String(row.restaurant_id),
    branch_id: row.branch_id ? String(row.branch_id) : null,
    user_id: String(row.user_id),
    telegram_user_id: Number(row.telegram_user_id),
    telegram_chat_id: Number(row.telegram_chat_id),
    telegram_username: row.telegram_username ? String(row.telegram_username) : null,
    restaurant_name: restaurant,
    branch_name: branch,
    role: row.role === "ADMIN" ? "ADMIN" : "STAFF",
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
    status: String(row.status ?? "active")
  };
}

function db() {
  return supabaseAdmin() as any;
}

function branchScoped(query: any, branchId?: string | null) {
  return branchId ? query.eq("branch_id", branchId) : query;
}

async function countRows(query: any) {
  const { count, error } = await query;
  if (error) return 0;
  return Number(count ?? 0);
}

function vietnamDayWindow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const startMs = Date.parse(`${year}-${month}-${day}T00:00:00+07:00`);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000).toISOString()
  };
}

function shortId(id: string) {
  return id.replaceAll("-", "").slice(0, 6).toUpperCase();
}

function callbackSecret() {
  return requiredEnv("TELEGRAM_CALLBACK_SECRET");
}

function connectSecret() {
  return readEnv("TELEGRAM_CONNECT_TOKEN_SECRET") || callbackSecret();
}

function sessionSecret() {
  return readEnv("TELEGRAM_SESSION_SECRET") || callbackSecret();
}

function callbackTtlSeconds() {
  const parsed = Number(readEnv("TELEGRAM_CALLBACK_TTL_SECONDS", "900"));
  return Number.isFinite(parsed) && parsed > 60 ? parsed : 900;
}

function sessionTtlSeconds(input?: number) {
  const parsed = Number(input ?? readEnv("TELEGRAM_SESSION_TTL_SECONDS", "300"));
  return Number.isFinite(parsed) && parsed >= 30 ? parsed : 300;
}

function normalizeNestedName(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("name" in row)) return null;
  const name = (row as { name?: unknown }).name;
  return name ? String(name) : null;
}
