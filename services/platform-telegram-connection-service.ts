import "server-only";

import { createHash, createHmac, randomBytes, randomUUID } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PlatformAdminRole, PlatformAdminSession } from "@/lib/platform-admin-auth";

const TOKEN_PREFIX = "lg1";
const SIGNATURE_LENGTH = 12;
const DEFAULT_TOKEN_TTL_SECONDS = 600;

type PlatformTelegramRole = "DEV" | "SUPPORT" | "SRE" | "ADMIN";

type PlatformTelegramConnectToken = {
  token: string;
  expiresAt: string;
  startUrl: string | null;
  startCommand: string;
  scopes: string[];
  role: PlatformTelegramRole;
  ttlSeconds: number;
};

export type PlatformTelegramConnectionView = {
  id: string;
  telegramUserId: number;
  username: string | null;
  displayName: string;
  role: PlatformTelegramRole;
  scopes: string[];
  status: string;
  connectedAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

export type PlatformTelegramTokenView = {
  id: string;
  actor: string;
  adminRole: PlatformAdminRole;
  telegramRole: PlatformTelegramRole;
  scopes: string[];
  state: "pending" | "expired" | "consumed" | "revoked";
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
  consumedByTelegramUserId: number | null;
  revokedAt: string | null;
};

export type PlatformTelegramAuditView = {
  id: string;
  connectionId: string | null;
  telegramUserId: number | null;
  action: string;
  outcome: "accepted" | "denied" | "failed" | "sent" | "skipped";
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

export type PlatformTelegramOpsState = {
  schemaReady: boolean;
  bot: {
    configured: boolean;
    username: string | null;
    startUrl: string | null;
    connectSecretConfigured: boolean;
    webhookConfigured: boolean;
    ttlSeconds: number;
  };
  summary: {
    activeConnections: number;
    revokedConnections: number;
    pendingTokens: number;
    consumedTokens: number;
    expiredTokens: number;
    revokedTokens: number;
    risk: "ready" | "warning" | "blocked";
  };
  connections: PlatformTelegramConnectionView[];
  tokens: PlatformTelegramTokenView[];
  auditLogs: PlatformTelegramAuditView[];
  warnings: string[];
};

export async function createPlatformTelegramConnectionToken(session: PlatformAdminSession): Promise<PlatformTelegramConnectToken> {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const actor = session.email || session.actor || "platform-admin";
  const { telegramRole, scopes } = platformTelegramAccessForRole(session.role);

  let revokeQuery = supabase
    .from("platform_telegram_connection_tokens")
    .update({ revoked_at: now })
    .is("consumed_at", null)
    .is("revoked_at", null);

  revokeQuery = session.userId
    ? revokeQuery.eq("platform_admin_user_id", session.userId)
    : revokeQuery.eq("actor", actor);

  const revokeResult = await revokeQuery;
  if (revokeResult.error) throw friendlyTokenSchemaError(revokeResult.error);

  const token = createSignedToken(connectSecret());
  const ttlSeconds = tokenTtlSeconds();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { error } = await supabase.from("platform_telegram_connection_tokens").insert({
    token_hash: tokenHash(token),
    platform_admin_user_id: session.userId,
    platform_admin_session_id: session.sessionId,
    actor,
    admin_role: session.role,
    telegram_role: telegramRole,
    scopes,
    expires_at: expiresAt,
    metadata: {
      source: "admin.logivn.com",
      nonce: randomUUID(),
      userAgent: "platform-control-center"
    }
  });
  if (error) throw friendlyTokenSchemaError(error);

  await writePlatformAuditLog({
    actor,
    action: "platform.telegram.connect_token.created",
    targetType: "platform_telegram_connection_token",
    metadata: {
      adminRole: session.role,
      telegramRole,
      expiresAt,
      scopes
    }
  });

  const botUsername = process.env.PLATFORM_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || "";
  return {
    token,
    expiresAt,
    startUrl: botUsername ? `https://t.me/${botUsername}?start=${encodeURIComponent(token)}` : null,
    startCommand: `/start ${token}`,
    scopes,
    role: telegramRole,
    ttlSeconds
  };
}

export async function getPlatformTelegramOpsState(): Promise<PlatformTelegramOpsState> {
  const supabase = createAdminSupabaseClient() as any;
  const botUsername = process.env.PLATFORM_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null;
  const bot = {
    configured: Boolean(botUsername && process.env.PLATFORM_TELEGRAM_BOT_TOKEN?.trim()),
    username: botUsername,
    startUrl: botUsername ? `https://t.me/${botUsername}` : null,
    connectSecretConfigured: Boolean(process.env.PLATFORM_TELEGRAM_CONNECT_TOKEN_SECRET?.trim()),
    webhookConfigured: Boolean(process.env.PLATFORM_TELEGRAM_WEBHOOK_SECRET?.trim() && process.env.PLATFORM_TELEGRAM_WEBHOOK_URL?.trim()),
    ttlSeconds: tokenTtlSeconds()
  };

  const [connectionsResult, tokensResult, auditResult] = await Promise.all([
    supabase
      .from("platform_telegram_connections")
      .select("id,telegram_user_id,telegram_username,display_name,role,scopes,status,connected_at,last_seen_at,revoked_at")
      .order("last_seen_at", { ascending: false })
      .limit(25),
    supabase
      .from("platform_telegram_connection_tokens")
      .select("id,actor,admin_role,telegram_role,scopes,expires_at,created_at,consumed_at,consumed_by_telegram_user_id,revoked_at")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("platform_telegram_audit_logs")
      .select("id,connection_id,telegram_user_id,action,outcome,target_type,target_id,created_at")
      .order("created_at", { ascending: false })
      .limit(30)
  ]);

  const schemaMissing = [connectionsResult.error, tokensResult.error, auditResult.error].some(isMissingSchemaError);
  if (schemaMissing) return emptyOpsState(bot, ["Thiếu migration Platform Telegram DevOps."]);
  if (connectionsResult.error) throw connectionsResult.error;
  if (tokensResult.error) throw friendlyTokenSchemaError(tokensResult.error);
  if (auditResult.error) throw auditResult.error;

  const connections = ((connectionsResult.data ?? []) as Record<string, unknown>[]).map(normalizeConnectionView);
  const tokens = ((tokensResult.data ?? []) as Record<string, unknown>[]).map(normalizeTokenView);
  const auditLogs = ((auditResult.data ?? []) as Record<string, unknown>[]).map(normalizeAuditView);
  const summary = {
    activeConnections: connections.filter((item) => item.status === "active").length,
    revokedConnections: connections.filter((item) => item.status === "revoked").length,
    pendingTokens: tokens.filter((item) => item.state === "pending").length,
    consumedTokens: tokens.filter((item) => item.state === "consumed").length,
    expiredTokens: tokens.filter((item) => item.state === "expired").length,
    revokedTokens: tokens.filter((item) => item.state === "revoked").length,
    risk: "ready" as PlatformTelegramOpsState["summary"]["risk"]
  };
  const warnings = buildOpsWarnings(bot, summary);
  summary.risk = !bot.configured || !bot.connectSecretConfigured || !bot.webhookConfigured ? "blocked" : warnings.length ? "warning" : "ready";

  return {
    schemaReady: true,
    bot,
    summary,
    connections,
    tokens,
    auditLogs,
    warnings
  };
}

export async function revokePlatformTelegramConnection(session: PlatformAdminSession, input: { connectionId: string; reason?: string | null }) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const reason = input.reason?.trim() || "admin_revoked";
  const { data, error } = await supabase
    .from("platform_telegram_connections")
    .update({
      status: "revoked",
      revoked_at: now,
      metadata: { revokedBy: session.actor, revokedReason: reason, revokedFrom: "admin.logivn.com" }
    })
    .eq("id", input.connectionId)
    .eq("status", "active")
    .select("id,telegram_user_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Kết nối Telegram không tồn tại hoặc đã bị thu hồi.");

  await writePlatformAuditLog({
    actor: session.actor,
    action: "platform.telegram.connection.revoked",
    targetType: "platform_telegram_connection",
    targetId: input.connectionId,
    metadata: { reason, telegramUserId: Number(data.telegram_user_id), revokedAt: now }
  });
}

export async function revokePlatformTelegramToken(session: PlatformAdminSession, input: { tokenId?: string | null; revokeAll?: boolean }) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  let query = supabase
    .from("platform_telegram_connection_tokens")
    .update({ revoked_at: now })
    .is("consumed_at", null)
    .is("revoked_at", null);

  query = input.revokeAll ? query : query.eq("id", input.tokenId);
  const { data, error } = await query.select("id");
  if (error) throw friendlyTokenSchemaError(error);

  const revokedIds = (data ?? []).map((row: { id: string }) => row.id);
  await writePlatformAuditLog({
    actor: session.actor,
    action: input.revokeAll ? "platform.telegram.connect_token.revoked_all" : "platform.telegram.connect_token.revoked",
    targetType: "platform_telegram_connection_token",
    targetId: input.revokeAll ? null : input.tokenId ?? null,
    metadata: { revokedAt: now, count: revokedIds.length, revokedIds }
  });
}

function platformTelegramAccessForRole(role: PlatformAdminRole): { telegramRole: PlatformTelegramRole; scopes: string[] } {
  if (role === "owner") {
    return {
      telegramRole: "ADMIN",
      scopes: ["platform.admin", "infra.read", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read"]
    };
  }

  if (role === "ops") {
    return {
      telegramRole: "SRE",
      scopes: ["infra.read", "queues.read", "queues.retry", "incidents.read", "incidents.manage", "deploy.read"]
    };
  }

  if (role === "support") {
    return {
      telegramRole: "SUPPORT",
      scopes: ["infra.read", "queues.read", "incidents.read", "support.grants.request"]
    };
  }

  return {
    telegramRole: "DEV",
    scopes: ["infra.read", "queues.read", "incidents.read"]
  };
}

function emptyOpsState(bot: PlatformTelegramOpsState["bot"], warnings: string[]): PlatformTelegramOpsState {
  return {
    schemaReady: false,
    bot,
    summary: {
      activeConnections: 0,
      revokedConnections: 0,
      pendingTokens: 0,
      consumedTokens: 0,
      expiredTokens: 0,
      revokedTokens: 0,
      risk: "blocked"
    },
    connections: [],
    tokens: [],
    auditLogs: [],
    warnings
  };
}

function buildOpsWarnings(bot: PlatformTelegramOpsState["bot"], summary: PlatformTelegramOpsState["summary"]) {
  const warnings: string[] = [];
  if (!bot.configured) warnings.push("DevOps bot chưa đủ token/username.");
  if (!bot.connectSecretConfigured) warnings.push("Thiếu connect token secret cho admin.logivn.com và VPS.");
  if (!bot.webhookConfigured) warnings.push("Webhook DevOps bot chưa đủ secret hoặc URL.");
  if (summary.activeConnections === 0) warnings.push("Chưa có tài khoản DevOps Telegram đang hoạt động.");
  if (summary.pendingTokens > 3) warnings.push("Có nhiều token kết nối đang chờ, nên thu hồi token thừa.");
  return warnings;
}

function normalizeConnectionView(row: Record<string, unknown>): PlatformTelegramConnectionView {
  return {
    id: String(row.id),
    telegramUserId: Number(row.telegram_user_id),
    username: row.telegram_username ? String(row.telegram_username) : null,
    displayName: row.display_name ? String(row.display_name) : row.telegram_username ? String(row.telegram_username) : `dev-${String(row.telegram_user_id)}`,
    role: normalizeTelegramRole(row.role),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    status: String(row.status ?? "active"),
    connectedAt: String(row.connected_at),
    lastSeenAt: String(row.last_seen_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null
  };
}

function normalizeTokenView(row: Record<string, unknown>): PlatformTelegramTokenView {
  const consumedAt = row.consumed_at ? String(row.consumed_at) : null;
  const revokedAt = row.revoked_at ? String(row.revoked_at) : null;
  const expiresAt = String(row.expires_at);
  return {
    id: String(row.id),
    actor: String(row.actor ?? "platform-admin"),
    adminRole: normalizeAdminRole(row.admin_role),
    telegramRole: normalizeTelegramRole(row.telegram_role),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    state: revokedAt ? "revoked" : consumedAt ? "consumed" : new Date(expiresAt).getTime() <= Date.now() ? "expired" : "pending",
    expiresAt,
    createdAt: String(row.created_at),
    consumedAt,
    consumedByTelegramUserId: row.consumed_by_telegram_user_id ? Number(row.consumed_by_telegram_user_id) : null,
    revokedAt
  };
}

function normalizeAuditView(row: Record<string, unknown>): PlatformTelegramAuditView {
  return {
    id: String(row.id),
    connectionId: row.connection_id ? String(row.connection_id) : null,
    telegramUserId: row.telegram_user_id ? Number(row.telegram_user_id) : null,
    action: String(row.action ?? "platform.telegram.unknown"),
    outcome: normalizeAuditOutcome(row.outcome),
    targetType: row.target_type ? String(row.target_type) : null,
    targetId: row.target_id ? String(row.target_id) : null,
    createdAt: String(row.created_at)
  };
}

function normalizeAdminRole(value: unknown): PlatformAdminRole {
  if (value === "owner" || value === "ops" || value === "billing" || value === "content" || value === "support" || value === "readonly") return value;
  return "readonly";
}

function normalizeTelegramRole(value: unknown): PlatformTelegramRole {
  if (value === "ADMIN" || value === "SRE" || value === "SUPPORT" || value === "DEV") return value;
  return "DEV";
}

function normalizeAuditOutcome(value: unknown): PlatformTelegramAuditView["outcome"] {
  if (value === "accepted" || value === "denied" || value === "failed" || value === "sent" || value === "skipped") return value;
  return "failed";
}

async function writePlatformAuditLog({
  actor,
  action,
  targetType,
  targetId,
  metadata = {}
}: {
  actor: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("platform_audit_logs").insert({
    actor,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    metadata
  });
  if (error && !isMissingSchemaError(error)) throw error;
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
  const secret = process.env.PLATFORM_TELEGRAM_CONNECT_TOKEN_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    const fallback = process.env.PLATFORM_TELEGRAM_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (fallback) return fallback;
  }
  throw new Error("Thiếu PLATFORM_TELEGRAM_CONNECT_TOKEN_SECRET cho link kết nối DevOps Telegram.");
}

function tokenTtlSeconds() {
  const parsed = Number(process.env.PLATFORM_TELEGRAM_CONNECT_TOKEN_TTL_SECONDS ?? DEFAULT_TOKEN_TTL_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_TOKEN_TTL_SECONDS;
  return Math.min(Math.max(Math.floor(parsed), 120), 1800);
}

function friendlyTokenSchemaError(error: { code?: string; message?: string }) {
  if (isMissingSchemaError(error)) {
    return new Error("Thiếu migration platform_telegram_connection_tokens cho DevOps Telegram.");
  }
  return error;
}

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /platform_telegram_connection_tokens|platform_audit_logs/i.test(error.message ?? "")
  );
}
