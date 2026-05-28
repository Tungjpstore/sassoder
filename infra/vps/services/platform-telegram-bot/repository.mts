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

export async function getPlatformConnectionForTelegramUser(telegramUserId: number) {
  const { data, error } = await db()
    .from("platform_telegram_connections")
    .select("id,telegram_user_id,telegram_chat_id,telegram_username,display_name,role,scopes,status")
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeConnection(data) : null;
}

export async function getPlatformAlertRecipients(requiredScope = "incidents.read") {
  const { data, error } = await db()
    .from("platform_telegram_connections")
    .select("id,telegram_user_id,telegram_chat_id,telegram_username,display_name,role,scopes,status")
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(25);
  if (isMissingPlatformTelegramSchema(error)) return [];
  if (error) throw error;
  return (data ?? []).map(normalizeConnection).filter((connection: PlatformTelegramConnection) => hasPlatformScope(connection, requiredScope));
}

export async function connectPlatformTelegramAccount(identity: TelegramIdentity, input: { role?: PlatformTelegramRole; scopes?: string[] } = {}) {
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
        metadata: { source: "platform_telegram_bootstrap" }
      },
      { onConflict: "telegram_user_id" }
    )
    .select("id,telegram_user_id,telegram_chat_id,telegram_username,display_name,role,scopes,status")
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

function normalizeConnection(row: Record<string, unknown>): PlatformTelegramConnection {
  return {
    id: String(row.id),
    telegram_user_id: Number(row.telegram_user_id),
    telegram_chat_id: Number(row.telegram_chat_id),
    telegram_username: row.telegram_username ? String(row.telegram_username) : null,
    display_name: row.display_name ? String(row.display_name) : null,
    role: normalizeRole(row.role),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    status: String(row.status ?? "active")
  };
}

function normalizeRole(value: unknown): PlatformTelegramRole {
  if (value === "SUPPORT" || value === "SRE" || value === "ADMIN") return value;
  return "DEV";
}

async function getPlatformConnectionByIdForTelegramUser(connectionId: string, telegramUserId: number) {
  const { data, error } = await db()
    .from("platform_telegram_connections")
    .select("id,telegram_user_id,telegram_chat_id,telegram_username,display_name,role,scopes,status")
    .eq("id", connectionId)
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeConnection(data) : null;
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
  if (role === "SUPPORT") return ["infra.read", "queues.read", "incidents.read", "support.grants.request"];
  if (role === "SRE") return ["infra.read", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read"];
  if (role === "ADMIN") return ["platform.admin", "infra.read", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read"];
  return ["infra.read", "queues.read", "incidents.read", "deploy.read"];
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

function db() {
  return supabaseAdmin() as any;
}

function sessionSecret() {
  return requiredEnv("PLATFORM_TELEGRAM_SESSION_SECRET");
}

function sessionTtlSeconds(input?: number) {
  const parsed = Number(input ?? readEnv("PLATFORM_TELEGRAM_SESSION_TTL_SECONDS", "300"));
  return Number.isFinite(parsed) && parsed >= 30 ? parsed : 300;
}
