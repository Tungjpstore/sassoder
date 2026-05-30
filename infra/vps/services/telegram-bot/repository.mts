import { readEnv, requiredEnv } from "../shared/env.js";
import { supabaseAdmin } from "../shared/supabase.js";
import { assertSignedToken, createSignedToken, tokenHash } from "./crypto.mjs";
import { requiredPermissionByAction, type CallbackActionRecord, type TelegramActionType, type TelegramConnection } from "./types.mjs";

type RecipientQuery = {
  restaurantId: string;
  branchId?: string | null;
  requiredPermission?: string;
  recipientScope?: "permission" | "admins" | "branch" | "silent";
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

export type TelegramOpsInboxSlice = "hot_orders" | "payments" | "reservations" | "staff" | "menu_ops";

export type TelegramOpsInboxItem = {
  id: string;
  branchId: string | null;
  kind: "order" | "payment" | "reservation" | "service_request" | "staff_request" | "menu_item";
  title: string;
  detail: string;
  priority: number;
  resourceType: "order" | "reservation" | "service_request" | "staff_request" | "menu_item";
  createdAt: string | null;
  state: Record<string, unknown>;
};

export type TelegramOpsIncidentView = {
  id: string;
  severity: "critical" | "warning" | "info";
  area: string;
  title: string;
  summary: string | null;
  lastSeenAt: string | null;
};

export type TelegramOwnerBriefingView = {
  id: string;
  title: string;
  summary: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
  actions: Array<{
    label: string;
    description: string | null;
    href: string | null;
    safety: string | null;
  }>;
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
  "menu.view": ["menu.edit", "menu.manage"],
  "menu.edit": ["menu.manage"],
  "attendance.view": ["attendance.edit", "attendance.approve"],
  "notifications.manage": ["settings.manage"]
};

const TELEGRAM_CONNECTION_SELECT =
  "id,restaurant_id,branch_id,user_id,staff_member_id,telegram_user_id,telegram_chat_id,telegram_username,role,permissions,status,restaurant:restaurants(name),branch:store_branches(name)";

type CurrentTelegramAccess = {
  role: "ADMIN" | "STAFF";
  permissions: string[];
  staffMemberId: string | null;
  branchIds: Set<string> | null;
  activeBranchCount: number;
  branchScopeReady: boolean;
};

export async function getTelegramRecipients(input: RecipientQuery): Promise<TelegramConnection[]> {
  if (input.recipientScope === "silent") return [];

  let query = db()
    .from("telegram_connections")
    .select(TELEGRAM_CONNECTION_SELECT)
    .eq("restaurant_id", input.restaurantId)
    .eq("status", "active");

  if (input.branchId) {
    query = query.or(`branch_id.is.null,branch_id.eq.${input.branchId}`);
  } else {
    query = query.is("branch_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;

  const connections = await refreshTelegramConnectionsAccess((data ?? []).map(normalizeConnection));
  return connections
    .filter((connection: TelegramConnection) => recipientScopeAllows(connection, input))
    .filter((connection: TelegramConnection) => !input.requiredPermission || hasPermission(connection, input.requiredPermission));
}

export async function getTelegramEventPolicy(input: { restaurantId: string; branchId?: string | null; eventType: string }) {
  const result = await db()
    .from("telegram_notification_policies")
    .select("id,event_type,branch_id,enabled,recipient_scope,required_permission,priority,escalation_after_seconds,escalate_to_admin,digest_enabled")
    .eq("restaurant_id", input.restaurantId)
    .eq("event_type", input.eventType)
    .order("branch_id", { ascending: false, nullsFirst: false })
    .limit(10);

  if (isMissingTelegramOpsPolicySchema(result.error)) return null;
  if (result.error) throw result.error;

  const rows = result.data ?? [];
  const matched =
    (input.branchId ? rows.find((row: any) => row.branch_id === input.branchId) : null) ??
    rows.find((row: any) => row.branch_id == null) ??
    null;
  if (!matched) return null;

  return {
    id: String(matched.id),
    enabled: matched.enabled !== false,
    recipientScope: normalizeRecipientScope(matched.recipient_scope),
    requiredPermission: matched.required_permission ? String(matched.required_permission) : null,
    priority: Number(matched.priority ?? 5),
    escalationAfterSeconds: matched.escalation_after_seconds == null ? null : Number(matched.escalation_after_seconds),
    escalateToAdmin: matched.escalate_to_admin !== false,
    digestEnabled: Boolean(matched.digest_enabled)
  };
}

export async function getTelegramConnectionsForUser(telegramUserId: number): Promise<TelegramConnection[]> {
  const { data, error } = await db()
    .from("telegram_connections")
    .select(TELEGRAM_CONNECTION_SELECT)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return refreshTelegramConnectionsAccess((data ?? []).map(normalizeConnection));
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
    countReservationsForBoard({ restaurantId, branchId, startsFrom: today.start, startsBefore: today.end, statuses: ["holding", "waiting_deposit_confirm", "confirmed", "checked_in", "seated"] }),
    countReservationsForBoard({ restaurantId, branchId, statuses: ["holding", "waiting_deposit_confirm"], depositStatuses: ["waiting_payment", "waiting_confirm"] }),
    countServiceRequestsForBoard(restaurantId, branchId),
    countStaffApprovalRequests(connection),
    countRows(branchScoped(db().from("telegram_notifications").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).in("status", ["failed", "rate_limited"]), branchId))
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

export async function getTelegramOpsInbox(connection: TelegramConnection, slice: TelegramOpsInboxSlice): Promise<TelegramOpsInboxItem[]> {
  if (slice === "payments") return getPaymentInbox(connection);
  if (slice === "reservations") return getReservationInbox(connection);
  if (slice === "staff") return getStaffInbox(connection);
  if (slice === "menu_ops") return getMenuInbox(connection);
  return getHotOrderInbox(connection);
}

export async function getTelegramOpenIncidents(connection: TelegramConnection, limit = 5): Promise<TelegramOpsIncidentView[]> {
  let query = db()
    .from("telegram_ops_incidents")
    .select("id,severity,area,title,summary,last_seen_at,branch_id")
    .eq("restaurant_id", connection.restaurant_id)
    .in("status", ["open", "acknowledged"])
    .order("last_seen_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 10)));

  if (connection.branch_id) query = query.or(`branch_id.is.null,branch_id.eq.${connection.branch_id}`);

  const result = await query;
  if (isMissingTelegramOpsPolicySchema(result.error)) return [];
  if (result.error) throw result.error;

  return (result.data ?? []).map((row: any) => ({
    id: String(row.id),
    severity: normalizeIncidentSeverity(row.severity),
    area: String(row.area ?? "system"),
    title: String(row.title ?? "Sự cố vận hành"),
    summary: row.summary ? String(row.summary) : null,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null
  }));
}

export async function getTelegramOwnerBriefings(connection: TelegramConnection, limit = 5): Promise<TelegramOwnerBriefingView[]> {
  let query = db()
    .from("telegram_owner_briefings")
    .select("id,title,summary,status,period_start,period_end,provider,model,actions,created_at,branch_id")
    .eq("restaurant_id", connection.restaurant_id)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 10)));

  if (connection.branch_id) query = query.or(`branch_id.is.null,branch_id.eq.${connection.branch_id}`);

  const result = await query;
  if (isMissingTelegramOpsPolicySchema(result.error)) return [];
  if (result.error) throw result.error;

  return (result.data ?? []).map((row: any) => ({
    id: String(row.id),
    title: String(row.title ?? "AI Ops brief"),
    summary: String(row.summary ?? ""),
    status: String(row.status ?? "generated"),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    provider: row.provider ? String(row.provider) : null,
    model: row.model ? String(row.model) : null,
    createdAt: String(row.created_at),
    actions: normalizeBriefingActions(row.actions)
  }));
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

  if (connection.branch_id && !typedAction.branch_id) {
    await recordTelegramAudit({
      restaurantId: typedAction.restaurant_id,
      branchId: typedAction.branch_id,
      connectionId: connection.id,
      userId: connection.user_id,
      telegramUserId,
      action: typedAction.action_type,
      outcome: "denied",
      metadata: { reason: "global_callback_for_branch_connection" }
    });
    throw new Error("branch_not_authorized");
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
  const currentUser = await getActiveTelegramConnectUser(connectToken.restaurant_id, connectToken.user_id);
  await assertTelegramConnectionBranchAccess(connectToken.restaurant_id, connectToken.branch_id ?? null, currentUser);
  const staffMemberId = currentUser.staffMemberId ?? metadataStaffMemberId(connectToken.metadata);

  const connectionPayload = {
    restaurant_id: connectToken.restaurant_id,
    branch_id: connectToken.branch_id ?? null,
    user_id: connectToken.user_id,
    staff_member_id: staffMemberId,
    telegram_user_id: identity.telegramUserId,
    telegram_chat_id: identity.chatId,
    telegram_username: identity.username ?? null,
    telegram_first_name: identity.firstName ?? null,
    telegram_last_name: identity.lastName ?? null,
    role: currentUser.role,
    permissions: currentUser.permissions.length > 0 ? currentUser.permissions : connectToken.permissions ?? [],
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

async function getActiveTelegramConnectUser(
  restaurantId: string,
  userId: string
): Promise<Pick<CurrentTelegramAccess, "role" | "staffMemberId"> & { staffRoleCode: string | null; staffRoleId: string | null; permissions: string[] }> {
  const [userResult, staffResult] = await Promise.all([
    db()
      .from("users")
      .select("id,role,permissions,account_status")
      .eq("restaurant_id", restaurantId)
      .eq("id", userId)
      .maybeSingle(),
    db()
      .from("staff_members")
      .select("id,role_code,role_id,employment_status,archived_at")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", userId)
      .maybeSingle()
  ]);
  if (userResult.error) throw userResult.error;
  if (staffResult.error) throw staffResult.error;
  const data = userResult.data;
  if (!data || data.account_status === "blocked") throw new Error("connect_user_not_active");
  const staffMember = staffResult.data;
  if (staffMember && (staffMember.employment_status !== "active" || staffMember.archived_at)) throw new Error("connect_staff_not_active");

  const role: "ADMIN" | "STAFF" = data.role === "ADMIN" ? "ADMIN" : "STAFF";

  return {
    role,
    permissions: normalizePermissionList(data.permissions),
    staffMemberId: staffMember?.id ? String(staffMember.id) : null,
    staffRoleCode: staffMember?.role_code ? String(staffMember.role_code) : null,
    staffRoleId: staffMember?.role_id ? String(staffMember.role_id) : null
  };
}

function metadataStaffMemberId(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const staffMemberId = (value as { staffMemberId?: unknown }).staffMemberId;
  return typeof staffMemberId === "string" && staffMemberId.trim() ? staffMemberId.trim() : null;
}

function normalizePermissionList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 100) : [];
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

export async function upsertTelegramOpsIncident(input: {
  restaurantId: string;
  branchId?: string | null;
  incidentKey: string;
  severity: "critical" | "warning" | "info";
  area: "orders" | "payments" | "reservations" | "delivery" | "staff" | "inventory" | "menu" | "telegram" | "ai" | "system";
  title: string;
  summary?: string | null;
  sourceEventId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const row = {
    restaurant_id: input.restaurantId,
    branch_id: input.branchId ?? null,
    incident_key: input.incidentKey,
    severity: input.severity,
    area: input.area,
    status: "open",
    title: input.title,
    summary: input.summary ?? null,
    source_event_id: input.sourceEventId ?? null,
    last_seen_at: new Date().toISOString(),
    metadata: input.metadata ?? {}
  };

  const result = await db().from("telegram_ops_incidents").upsert(row, { onConflict: "restaurant_id,incident_key" });
  if (isMissingTelegramOpsPolicySchema(result.error)) return;
  if (result.error) throw result.error;
}

export function hasPermission(connection: TelegramConnection, permission: string) {
  if (connection.role === "ADMIN") return true;
  const permissions = new Set(connection.permissions);
  if (permissions.has(permission)) return true;
  return (legacyPermissionFallbacks[permission] ?? []).some((fallback) => permissions.has(fallback));
}

async function refreshTelegramConnectionsAccess(connections: TelegramConnection[]) {
  const refreshed = await Promise.all(connections.map(refreshTelegramConnectionAccess));
  return refreshed.filter((connection): connection is TelegramConnection => Boolean(connection));
}

async function refreshTelegramConnectionAccess(connection: TelegramConnection) {
  const access = await resolveCurrentTelegramAccess(connection.restaurant_id, connection.user_id);
  if (!access) {
    await revokeStaleTelegramConnection(connection, "user_or_staff_not_active");
    return null;
  }

  if (!connectionBranchAllowed(connection.branch_id, access)) {
    await revokeStaleTelegramConnection(connection, "branch_scope_no_longer_allowed");
    return null;
  }

  const next: TelegramConnection = {
    ...connection,
    role: access.role,
    permissions: access.permissions,
    staff_member_id: access.staffMemberId
  };

  if (telegramConnectionAccessChanged(connection, next)) {
    await persistTelegramConnectionAccess(next).catch(() => undefined);
  }

  return next;
}

async function resolveCurrentTelegramAccess(restaurantId: string, userId: string): Promise<CurrentTelegramAccess | null> {
  const [userResult, staffResult] = await Promise.all([
    db()
      .from("users")
      .select("id,role,permissions,account_status")
      .eq("restaurant_id", restaurantId)
      .eq("id", userId)
      .maybeSingle(),
    db()
      .from("staff_members")
      .select("id,role_id,role_code,employment_status,archived_at")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", userId)
      .maybeSingle()
  ]);
  if (userResult.error) throw userResult.error;
  if (staffResult.error) throw staffResult.error;

  const user = userResult.data;
  if (!user || user.account_status === "blocked") return null;

  const staff = staffResult.data;
  if (staff && (staff.archived_at || staff.employment_status !== "active")) return null;

  const role = user.role === "ADMIN" ? "ADMIN" : "STAFF";
  const staffMemberId = staff?.id ? String(staff.id) : null;
  const permissions = role === "ADMIN" ? [] : await resolveCurrentStaffPermissions(restaurantId, user.permissions, staff);
  const branchScope = await resolveCurrentBranchScope(restaurantId, role, staff);

  return {
    role,
    permissions,
    staffMemberId,
    ...branchScope
  };
}

async function resolveCurrentStaffPermissions(restaurantId: string, userPermissions: unknown, staff: Record<string, unknown> | null) {
  const roleId = staff?.role_id ? String(staff.role_id) : null;
  if (!roleId) return normalizePermissionList(userPermissions);

  const { data, error } = await db()
    .from("staff_role_permissions")
    .select("permission_key")
    .eq("restaurant_id", restaurantId)
    .eq("role_id", roleId);
  if (isMissingStaffScopeSchema(error)) return normalizePermissionList(userPermissions);
  if (error) throw error;

  const rolePermissions = normalizePermissionList((data ?? []).map((row: any) => row.permission_key));
  return rolePermissions.length > 0 ? rolePermissions : normalizePermissionList(userPermissions);
}

async function resolveCurrentBranchScope(restaurantId: string, role: "ADMIN" | "STAFF", staff: Record<string, unknown> | null) {
  if (role === "ADMIN" || staff?.role_code === "owner") {
    return { branchIds: null, activeBranchCount: 0, branchScopeReady: true };
  }

  if (!staff?.id) {
    return { branchIds: new Set<string>(), activeBranchCount: 0, branchScopeReady: true };
  }

  const today = new Date().toISOString().slice(0, 10);
  const [assignmentResult, shiftResult, branchResult] = await Promise.all([
    db()
      .from("staff_branch_assignments")
      .select("branch_id")
      .eq("restaurant_id", restaurantId)
      .eq("staff_member_id", staff.id)
      .eq("assignment_status", "active")
      .is("ended_at", null),
    db()
      .from("shift_assignments")
      .select("branch_id")
      .eq("restaurant_id", restaurantId)
      .eq("staff_member_id", staff.id)
      .neq("status", "cancelled")
      .gte("scheduled_date", today),
    db().from("store_branches").select("id", { count: "exact" }).eq("restaurant_id", restaurantId).eq("is_active", true).limit(2)
  ]);

  for (const result of [assignmentResult, shiftResult, branchResult]) {
    if (isMissingStaffScopeSchema(result.error)) {
      return { branchIds: new Set<string>(), activeBranchCount: 0, branchScopeReady: false };
    }
    if (result.error) throw result.error;
  }

  const branchIds = new Set<string>();
  for (const row of assignmentResult.data ?? []) if (row.branch_id) branchIds.add(String(row.branch_id));
  for (const row of shiftResult.data ?? []) if (row.branch_id) branchIds.add(String(row.branch_id));

  const activeBranches = (branchResult.data ?? []).map((row: any) => String(row.id));
  if (branchIds.size === 0 && Number(branchResult.count ?? activeBranches.length) === 1 && activeBranches[0]) {
    branchIds.add(activeBranches[0]);
  }

  return {
    branchIds,
    activeBranchCount: Number(branchResult.count ?? activeBranches.length),
    branchScopeReady: true
  };
}

async function assertTelegramConnectionBranchAccess(
  restaurantId: string,
  branchId: string | null,
  access: Pick<CurrentTelegramAccess, "role" | "staffMemberId"> & { staffRoleCode?: string | null; staffRoleId?: string | null; permissions: string[] }
) {
  if (branchId) await assertBranchBelongsToRestaurant(restaurantId, branchId);
  const branchScope = await resolveCurrentBranchScope(restaurantId, access.role, {
    id: access.staffMemberId,
    role_code: access.staffRoleCode ?? null,
    role_id: access.staffRoleId ?? null
  });
  if (!connectionBranchAllowed(branchId, { ...access, ...branchScope })) throw new Error("connect_branch_not_authorized");
}

async function assertBranchBelongsToRestaurant(restaurantId: string, branchId: string) {
  const { data, error } = await db().from("store_branches").select("id").eq("restaurant_id", restaurantId).eq("id", branchId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("branch_not_authorized");
}

function connectionBranchAllowed(branchId: string | null, access: CurrentTelegramAccess) {
  if (access.role === "ADMIN" || access.branchIds === null) return true;
  if (!access.branchScopeReady) return false;
  if (branchId) return access.branchIds.has(branchId);
  return access.branchIds.size <= 1 && access.activeBranchCount <= 1;
}

function telegramConnectionAccessChanged(previous: TelegramConnection, next: TelegramConnection) {
  return (
    previous.role !== next.role ||
    previous.staff_member_id !== next.staff_member_id ||
    previous.permissions.join("\u0000") !== next.permissions.join("\u0000")
  );
}

async function persistTelegramConnectionAccess(connection: TelegramConnection) {
  const { error } = await db()
    .from("telegram_connections")
    .update({
      role: connection.role,
      permissions: connection.permissions,
      staff_member_id: connection.staff_member_id,
      updated_at: new Date().toISOString()
    })
    .eq("id", connection.id)
    .eq("restaurant_id", connection.restaurant_id)
    .eq("status", "active");
  if (error) throw error;
}

async function revokeStaleTelegramConnection(connection: TelegramConnection, reason: string) {
  const now = new Date().toISOString();
  const { error } = await db()
    .from("telegram_connections")
    .update({ status: "revoked", revoked_at: now, updated_at: now })
    .eq("id", connection.id)
    .eq("restaurant_id", connection.restaurant_id)
    .eq("status", "active");
  if (error) throw error;

  await recordTelegramAudit({
    restaurantId: connection.restaurant_id,
    branchId: connection.branch_id,
    connectionId: connection.id,
    userId: connection.user_id,
    telegramUserId: connection.telegram_user_id,
    action: "telegram.connection.revoked_by_current_access",
    outcome: "denied",
    metadata: { reason }
  }).catch(() => undefined);
}

function isMissingStaffScopeSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42P01" || /staff_(members|roles|role_permissions|branch_assignments)|shift_assignments|permission_key|branch_id/i.test(error.message ?? "");
}

async function getConnectionForTelegramUser(restaurantId: string, telegramUserId: number) {
  const { data, error } = await db()
    .from("telegram_connections")
    .select(TELEGRAM_CONNECTION_SELECT)
    .eq("restaurant_id", restaurantId)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return refreshTelegramConnectionAccess(normalizeConnection(data));
}

async function getConnectionByIdForTelegramUser(restaurantId: string, connectionId: string, telegramUserId: number) {
  const { data, error } = await db()
    .from("telegram_connections")
    .select(TELEGRAM_CONNECTION_SELECT)
    .eq("id", connectionId)
    .eq("restaurant_id", restaurantId)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return refreshTelegramConnectionAccess(normalizeConnection(data));
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
    staff_member_id: row.staff_member_id ? String(row.staff_member_id) : null,
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

function recipientScopeAllows(connection: TelegramConnection, input: RecipientQuery) {
  if (input.recipientScope === "admins") return connection.role === "ADMIN";
  if (input.recipientScope === "branch" && input.branchId) {
    return connection.branch_id === input.branchId || (connection.role === "ADMIN" && connection.branch_id === null);
  }
  return true;
}

function normalizeRecipientScope(value: unknown): "permission" | "admins" | "branch" | "silent" {
  if (value === "admins" || value === "branch" || value === "silent") return value;
  return "permission";
}

function isMissingTelegramOpsPolicySchema(error: { code?: string; message?: string } | null | undefined) {
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

async function countReservationsForBoard(input: {
  restaurantId: string;
  branchId?: string | null;
  startsFrom?: string;
  startsBefore?: string;
  statuses: string[];
  depositStatuses?: string[];
}) {
  let query = db().from("reservations").eq("restaurant_id", input.restaurantId).in("status", input.statuses);
  if (input.startsFrom) query = query.gte("starts_at", input.startsFrom);
  if (input.startsBefore) query = query.lt("starts_at", input.startsBefore);
  if (input.depositStatuses?.length) query = query.in("deposit_status", input.depositStatuses);

  if (!input.branchId) return countRows(query.select("id", { count: "exact", head: true }));

  const { data, error } = await query
    .select("id,locks:reservation_table_locks(table:tables(branch_id))")
    .limit(500);
  if (error) return 0;
  return (data ?? []).filter((row: any) => reservationBranchFromLocks(row.locks) === input.branchId).length;
}

async function countServiceRequestsForBoard(restaurantId: string, branchId?: string | null) {
  let query = db().from("service_requests").eq("restaurant_id", restaurantId).in("status", ["open", "acknowledged"]);
  if (!branchId) return countRows(query.select("id", { count: "exact", head: true }));

  const { data, error } = await query.select("id,table:tables(branch_id)").limit(500);
  if (error) return 0;
  return (data ?? []).filter((row: any) => nestedBranchId(row.table) === branchId).length;
}

async function countStaffApprovalRequests(connection: TelegramConnection) {
  const query = staffApprovalRequestQuery(connection, "id", { count: "exact", head: true });
  return query ? countRows(query) : 0;
}

function staffApprovalRequestQuery(connection: TelegramConnection, select: string, options?: Record<string, unknown>) {
  if (!hasPermission(connection, "approvals.review") && !connection.staff_member_id) return null;
  let query = db()
    .from("attendance_approval_requests")
    .select(select, options)
    .eq("restaurant_id", connection.restaurant_id)
    .eq("status", "pending");
  query = branchScoped(query, connection.branch_id);
  if (!hasPermission(connection, "approvals.review")) query = query.eq("staff_member_id", connection.staff_member_id);
  return query;
}

async function getHotOrderInbox(connection: TelegramConnection) {
  const now = new Date().toISOString();
  const query = branchScoped(
    db()
      .from("orders")
      .select("id,branch_id,total,status,payment_status,fulfillment_type,delivery_status,customer_name,customer_phone,delivery_address,service_due_at,created_at,table:tables(name),items:order_items(quantity,price,note,modifier_snapshot,menuItem:menu_items(name))")
      .eq("restaurant_id", connection.restaurant_id)
      .in("status", ["pending", "ordering"])
      .order("service_due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(5),
    connection.branch_id
  );
  const { data, error } = await query;
  if (error) return [];

  return (data ?? []).map((row: any) => {
    const code = shortId(String(row.id));
    const late = row.service_due_at && new Date(row.service_due_at).getTime() < Date.now();
    const tableName = normalizeNestedName(row.table);
    return {
      id: String(row.id),
      branchId: row.branch_id ? String(row.branch_id) : null,
      kind: "order",
      title: `${late ? "Trễ SLA" : row.status === "pending" ? "Đơn cần nhận" : "Đơn đang xử lý"} #${code}`,
      detail: [tableName, fulfillmentLabel(row.fulfillment_type), row.customer_name, money(Number(row.total ?? 0)), orderItemsSummary(row.items)].filter(Boolean).join(" · "),
      priority: late ? 1 : row.status === "pending" ? 2 : 4,
      resourceType: "order",
      createdAt: row.created_at ? String(row.created_at) : null,
      state: {
        status: row.status,
        paymentStatus: row.payment_status,
        fulfillmentType: row.fulfillment_type,
        deliveryStatus: row.delivery_status,
        customerPhone: row.customer_phone,
        deliveryAddress: row.delivery_address,
        late
      }
    } satisfies TelegramOpsInboxItem;
  });
}

async function getPaymentInbox(connection: TelegramConnection) {
  const query = branchScoped(
    db()
      .from("orders")
      .select("id,branch_id,total,status,payment_status,payment_method,customer_name,customer_phone,fulfillment_type,delivery_address,created_at,table:tables(name),items:order_items(quantity,price,note,modifier_snapshot,menuItem:menu_items(name))")
      .eq("restaurant_id", connection.restaurant_id)
      .or("status.in.(waiting_confirm,waiting_payment),payment_status.in.(waiting_confirm,waiting_payment)")
      .order("updated_at", { ascending: true })
      .limit(5),
    connection.branch_id
  );
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row: any) => {
    const method = paymentMethodLabel(row.payment_method);
    return {
      id: String(row.id),
      branchId: row.branch_id ? String(row.branch_id) : null,
      kind: "payment",
      title: `${method} chờ xác nhận #${shortId(String(row.id))}`,
      detail: [normalizeNestedName(row.table), fulfillmentLabel(row.fulfillment_type), row.customer_name, money(Number(row.total ?? 0)), orderItemsSummary(row.items)].filter(Boolean).join(" · "),
      priority: 1,
      resourceType: "order",
      createdAt: row.created_at ? String(row.created_at) : null,
      state: {
        status: row.status,
        paymentStatus: row.payment_status,
        paymentMethod: row.payment_method,
        customerPhone: row.customer_phone,
        deliveryAddress: row.delivery_address
      }
    } satisfies TelegramOpsInboxItem;
  });
}

async function getReservationInbox(connection: TelegramConnection) {
  const today = vietnamDayWindow();
  const { data, error } = await db()
    .from("reservations")
    .select("id,status,deposit_status,deposit_required_amount,deposit_paid_amount,customer_name,customer_phone,customer_note,preferred_seating_zone,preferred_table_kind,party_size,starts_at,created_at,locks:reservation_table_locks(table:tables(name,branch_id))")
    .eq("restaurant_id", connection.restaurant_id)
    .gte("starts_at", today.start)
    .lt("starts_at", new Date(Date.parse(today.end) + 2 * 86_400_000).toISOString())
    .in("status", ["holding", "waiting_deposit_confirm", "confirmed"])
    .order("starts_at", { ascending: true })
    .limit(20);
  if (error) return [];
  return (data ?? [])
    .map((row: any) => ({ row, branchId: reservationBranchFromLocks(row.locks) }))
    .filter((item: { row: any; branchId: string | null }) => !connection.branch_id || item.branchId === connection.branch_id)
    .slice(0, 5)
    .map(({ row, branchId }: { row: any; branchId: string | null }) => ({
      id: String(row.id),
      branchId,
      kind: "reservation" as const,
      title: `Đặt bàn ${formatVietnamTime(row.starts_at)}`,
      detail: [row.customer_name, row.customer_phone, `${row.party_size} khách`, reservationTableSummary(row.locks), row.deposit_status === "waiting_confirm" ? "chờ cọc" : row.status, row.customer_note].filter(Boolean).join(" · "),
      priority: row.deposit_status === "waiting_confirm" ? 1 : 3,
      resourceType: "reservation" as const,
      createdAt: row.created_at ? String(row.created_at) : null,
      state: {
        status: row.status,
        depositStatus: row.deposit_status,
        startsAt: row.starts_at,
        depositRequiredAmount: row.deposit_required_amount,
        depositPaidAmount: row.deposit_paid_amount,
        customerPhone: row.customer_phone,
        customerNote: row.customer_note,
        preferredSeatingZone: row.preferred_seating_zone,
        preferredTableKind: row.preferred_table_kind
      }
    }));
}

async function getStaffInbox(connection: TelegramConnection) {
  const approvalsQuery = staffApprovalRequestQuery(
    connection,
    "id,branch_id,staff_member_id,request_type,status,reason,created_at,staff_member:staff_members(display_name)"
  );
  const [serviceRequests, approvals] = await Promise.all([
    db()
      .from("service_requests")
      .select("id,table_id,type,status,message,created_at,table:tables(name,branch_id)")
      .eq("restaurant_id", connection.restaurant_id)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: true })
      .limit(15),
    approvalsQuery ? approvalsQuery.order("created_at", { ascending: true }).limit(3) : Promise.resolve({ data: [], error: null })
  ]);

  const serviceItems = serviceRequests.error
    ? []
    : (serviceRequests.data ?? [])
        .map((row: any) => ({ row, branchId: nestedBranchId(row.table) }))
        .filter((item: { row: any; branchId: string | null }) => !connection.branch_id || item.branchId === connection.branch_id)
        .slice(0, 3)
        .map(({ row, branchId }: { row: any; branchId: string | null }) => ({
          id: String(row.id),
          branchId,
          kind: "service_request" as const,
          title: "Khách gọi phục vụ",
          detail: [normalizeNestedName(row.table), row.message].filter(Boolean).join(" · "),
          priority: 1,
          resourceType: "service_request" as const,
          createdAt: row.created_at ? String(row.created_at) : null,
          state: { status: row.status, type: row.type }
        }));

  const approvalItems = approvals.error
    ? []
    : (approvals.data ?? []).map((row: any) => ({
        id: String(row.id),
        branchId: row.branch_id ? String(row.branch_id) : null,
        kind: "staff_request" as const,
        title: staffRequestLabel(row.request_type),
        detail: [normalizeNestedName(row.staff_member), row.reason].filter(Boolean).join(" · "),
        priority: 2,
        resourceType: "staff_request" as const,
        createdAt: row.created_at ? String(row.created_at) : null,
        state: { status: row.status, requestType: row.request_type }
      }));

  return [...serviceItems, ...approvalItems].sort((a, b) => a.priority - b.priority).slice(0, 5);
}

async function getMenuInbox(connection: TelegramConnection) {
  const { data, error } = await db()
    .from("menu_items")
    .select("id,name,is_available,updated_at,created_at")
    .eq("restaurant_id", connection.restaurant_id)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(5);
  if (error) return [];
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    branchId: connection.branch_id,
    kind: "menu_item" as const,
    title: row.is_available ? "Đang bán" : "Đang ẩn",
    detail: String(row.name ?? "Món"),
    priority: row.is_available ? 4 : 2,
    resourceType: "menu_item" as const,
    createdAt: row.updated_at ? String(row.updated_at) : row.created_at ? String(row.created_at) : null,
    state: {
      available: Boolean(row.is_available)
    }
  }));
}

function money(amount: number) {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

function fulfillmentLabel(value: unknown) {
  if (value === "DINE_IN") return "Tại bàn";
  if (value === "PICKUP") return "Mang đi";
  if (value === "DELIVERY") return "Giao hàng";
  return value ? String(value) : null;
}

function paymentMethodLabel(value: unknown) {
  if (value === "QR") return "VietQR";
  if (value === "CASH") return "Tiền mặt";
  return value ? String(value) : "Thanh toán";
}

function orderItemsSummary(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const labels = value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, any>;
      const quantity = Number(record.quantity ?? 0);
      const menuItem = Array.isArray(record.menuItem) ? record.menuItem[0] : record.menuItem;
      const name = menuItem?.name ? String(menuItem.name) : "Món";
      const modifiers = modifierSummary(record.modifier_snapshot);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return `${quantity}x ${name}${modifiers ? ` (${modifiers})` : ""}`;
    })
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return null;
  return labels.join(", ");
}

function modifierSummary(value: unknown) {
  if (!Array.isArray(value)) return null;
  const labels = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const optionName = (item as { optionName?: unknown; option_name?: unknown }).optionName ?? (item as { option_name?: unknown }).option_name;
      return optionName ? String(optionName) : null;
    })
    .filter((label): label is string => Boolean(label));
  return labels.length ? labels.join(", ") : null;
}

function reservationTableSummary(value: unknown) {
  if (!Array.isArray(value)) return null;
  const names = value
    .map((lock) => {
      if (!lock || typeof lock !== "object") return null;
      return normalizeNestedName((lock as { table?: unknown }).table);
    })
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : null;
}

function reservationBranchFromLocks(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const lock of value) {
    if (!lock || typeof lock !== "object") continue;
    const branchId = nestedBranchId((lock as { table?: unknown }).table);
    if (branchId) return branchId;
  }
  return null;
}

function nestedBranchId(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const branchId = (row as { branch_id?: unknown }).branch_id;
  return typeof branchId === "string" && branchId.trim() ? branchId.trim() : null;
}

function formatVietnamTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}

function staffRequestLabel(value: string) {
  if (value === "leave_request") return "Xin nghỉ";
  if (value === "shift_swap") return "Đổi ca";
  if (value === "overtime") return "Tăng ca";
  if (value === "outside_location") return "Chấm công lệch vị trí";
  return "Duyệt nhân sự";
}

function normalizeIncidentSeverity(value: unknown): TelegramOpsIncidentView["severity"] {
  if (value === "critical" || value === "info") return value;
  return "warning";
}

function normalizeBriefingActions(value: unknown): TelegramOwnerBriefingView["actions"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      if (!label) return null;
      return {
        label: label.slice(0, 80),
        description: typeof record.description === "string" && record.description.trim() ? record.description.trim().slice(0, 180) : null,
        href: typeof record.href === "string" && record.href.startsWith("/dashboard") ? record.href.slice(0, 180) : null,
        safety: typeof record.safety === "string" ? record.safety.slice(0, 40) : null
      };
    })
    .filter((item): item is TelegramOwnerBriefingView["actions"][number] => Boolean(item))
    .slice(0, 5);
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
