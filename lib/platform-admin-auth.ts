import "server-only";

import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const cookieName = "logivn_platform_admin";
const cookiePath = "/";
const legacyCookiePath = "/adm" + "in";
const sessionTtlMs = 12 * 60 * 60 * 1000;
const credentialId = "primary";

const platformAdminRoles = ["owner", "ops", "billing", "content", "support", "readonly"] as const;
const ownerPermissions = [
  "platform.read",
  "platform.refresh",
  "content.write",
  "billing.write",
  "logimail.approve",
  "tenants.write",
  "tenants.suspend",
  "tenants.restore",
  "tenants.delete",
  "users.write",
  "users.block",
  "users.restore",
  "security.read",
  "release.read",
  "governance.read",
  "sessions.revoke",
  "admins.manage"
] as const;

type PlatformAdminRole = (typeof platformAdminRoles)[number];
type PlatformAdminPermission = (typeof ownerPermissions)[number];

type PlatformAdminAuthStatus = {
  configured: boolean;
  production: boolean;
  devFallbackEnabled: boolean;
  sessionTtlHours: number;
  storedPasswordConfigured: boolean;
  requiresFirstPasswordChange: boolean;
  rbacConfigured: boolean;
  adminUsersConfigured: boolean;
  bootstrapFallbackEnabled: boolean;
};

type PlatformAdminSession = {
  authenticated: boolean;
  mustChangePassword: boolean;
  issuedAt: number | null;
  sessionId: string | null;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  role: PlatformAdminRole;
  permissions: PlatformAdminPermission[];
  actor: string;
};

type PlatformAdminCredentialRow = {
  id: string;
  password_hash: string;
  password_salt: string;
  must_change_password: boolean;
  updated_at: string;
};

type PlatformAdminUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: PlatformAdminRole;
  status: "active" | "disabled";
  password_hash: string;
  password_salt: string;
  must_change_password: boolean;
  last_login_at: string | null;
};

type PlatformAdminSessionUser = Pick<PlatformAdminUserRow, "id" | "email" | "display_name" | "role">;

type PlatformAdminSessionRow = {
  id: string;
  user_id: string;
  role: PlatformAdminRole;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
};

type PlatformAdminVerification = {
  ok: boolean;
  mustChangePassword: boolean;
  user?: PlatformAdminUserRow | null;
  permissions?: PlatformAdminPermission[];
};

const fallbackRolePermissions: Record<PlatformAdminRole, PlatformAdminPermission[]> = {
  owner: [...ownerPermissions],
  ops: ["platform.read", "platform.refresh", "logimail.approve", "security.read", "release.read", "governance.read", "sessions.revoke"],
  billing: ["platform.read", "platform.refresh", "billing.write", "governance.read"],
  content: ["platform.read", "platform.refresh", "content.write", "governance.read"],
  support: ["platform.read", "platform.refresh", "tenants.suspend", "tenants.restore", "users.block", "users.restore", "governance.read"],
  readonly: ["platform.read", "governance.read"]
};

const unauthenticatedSession: PlatformAdminSession = {
  authenticated: false,
  mustChangePassword: false,
  issuedAt: null,
  sessionId: null,
  userId: null,
  email: null,
  displayName: null,
  role: "readonly",
  permissions: [],
  actor: "platform-admin"
};

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

function getExpectedPassword() {
  const configuredPassword = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
  if (configuredPassword) return configuredPassword;
  if (process.env.NODE_ENV !== "production") return "local-dev-admin";
  return "";
}

function getSessionSecret() {
  return (
    process.env.PLATFORM_ADMIN_SESSION_SECRET?.trim() ||
    process.env.PLATFORM_ADMIN_PASSWORD?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function sign(value: string) {
  const secret = getSessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function shouldRejectLegacySession(status: PlatformAdminAuthStatus) {
  return status.production || (status.rbacConfigured && status.adminUsersConfigured);
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString("hex")
  };
}

function verifyPasswordHash(password: string, salt: string, expectedHash: string) {
  const { hash } = hashPassword(password, salt);
  return safeEqual(hash, expectedHash);
}

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("does not exist") ||
    error.message?.includes("Could not find")
  );
}

function isPlatformAdminRole(value: string): value is PlatformAdminRole {
  return platformAdminRoles.includes(value as PlatformAdminRole);
}

function filterPermissions(values: unknown[]): PlatformAdminPermission[] {
  return values.filter((value): value is PlatformAdminPermission =>
    typeof value === "string" && ownerPermissions.includes(value as PlatformAdminPermission)
  );
}

async function getStoredCredential() {
  try {
    const supabase = createAdminSupabaseClient() as any;
    const { data, error } = await supabase
      .from("platform_admin_credentials")
      .select("id,password_hash,password_salt,must_change_password,updated_at")
      .eq("id", credentialId)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) return null;
      throw error;
    }

    return (data ?? null) as PlatformAdminCredentialRow | null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") return null;
    throw error;
  }
}

async function getAdminUserAvailability() {
  try {
    const supabase = createAdminSupabaseClient() as any;
    const { count, error } = await supabase.from("platform_admin_users").select("id", { count: "exact", head: true });
    if (error) {
      if (isMissingSchemaError(error)) return { configured: false, count: 0 };
      throw error;
    }
    return { configured: true, count: count ?? 0 };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") return { configured: false, count: 0 };
    throw error;
  }
}

async function getRolePermissions(role: PlatformAdminRole): Promise<PlatformAdminPermission[]> {
  try {
    const supabase = createAdminSupabaseClient() as any;
    const { data, error } = await supabase
      .from("platform_admin_role_permissions")
      .select("permission")
      .eq("role", role);

    if (error) {
      if (isMissingSchemaError(error)) return fallbackRolePermissions[role];
      throw error;
    }

    const permissions = filterPermissions((data ?? []).map((row: { permission?: unknown }) => row.permission));
    if (role === "owner") return Array.from(new Set([...permissions, ...ownerPermissions]));
    return permissions.length ? permissions : fallbackRolePermissions[role];
  } catch (error) {
    if (process.env.NODE_ENV !== "production") return fallbackRolePermissions[role];
    throw error;
  }
}

async function getStoredAdminUserByEmail(email: string) {
  try {
    const supabase = createAdminSupabaseClient() as any;
    const { data, error } = await supabase
      .from("platform_admin_users")
      .select("id,email,display_name,role,status,password_hash,password_salt,must_change_password,last_login_at")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) return null;
      throw error;
    }

    return normalizePlatformAdminUser(data);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") return null;
    throw error;
  }
}

async function getStoredAdminUserById(userId: string) {
  try {
    const supabase = createAdminSupabaseClient() as any;
    const { data, error } = await supabase
      .from("platform_admin_users")
      .select("id,email,display_name,role,status,password_hash,password_salt,must_change_password,last_login_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) return null;
      throw error;
    }

    return normalizePlatformAdminUser(data);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") return null;
    throw error;
  }
}

function normalizePlatformAdminUser(value: unknown): PlatformAdminUserRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const role = typeof row.role === "string" && isPlatformAdminRole(row.role) ? row.role : "readonly";
  const status = row.status === "disabled" ? "disabled" : "active";
  if (typeof row.id !== "string" || typeof row.email !== "string") return null;
  if (typeof row.password_hash !== "string" || typeof row.password_salt !== "string") return null;

  return {
    id: row.id,
    email: row.email,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    role,
    status,
    password_hash: row.password_hash,
    password_salt: row.password_salt,
    must_change_password: row.must_change_password === true,
    last_login_at: typeof row.last_login_at === "string" ? row.last_login_at : null
  };
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

async function writePlatformAdminPassword(password: string, actor = "platform-admin") {
  const supabase = createAdminSupabaseClient() as any;
  const next = hashPassword(password);
  const now = new Date().toISOString();
  const { error } = await supabase.from("platform_admin_credentials").upsert({
    id: credentialId,
    password_hash: next.hash,
    password_salt: next.salt,
    must_change_password: false,
    updated_at: now,
    updated_by: actor
  });

  if (error) throw error;

  await writePlatformAuditLog({
    actor,
    action: "platform_admin_password_changed",
    targetType: "platform_admin_credential",
    targetId: credentialId,
    metadata: { changedAt: now }
  });
}

async function createBootstrapOwnerFromLegacyPassword({
  email,
  password,
  mustChangePassword
}: {
  email: string;
  password: string;
  mustChangePassword: boolean;
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const availability = await getAdminUserAvailability();
  if (!availability.configured || availability.count > 0) return null;

  const supabase = createAdminSupabaseClient() as any;
  const next = hashPassword(password);
  const now = new Date().toISOString();
  const userId = randomUUID();
  const { data, error } = await supabase
    .from("platform_admin_users")
    .insert({
      id: userId,
      email: normalizedEmail,
      display_name: "Platform Owner",
      role: "owner",
      status: "active",
      password_hash: next.hash,
      password_salt: next.salt,
      must_change_password: mustChangePassword,
      created_by: "bootstrap",
      updated_by: "bootstrap"
    })
    .select("id,email,display_name,role,status,password_hash,password_salt,must_change_password,last_login_at")
    .single();

  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }

  await writePlatformAuditLog({
    actor: normalizedEmail,
    action: "platform_admin_owner_bootstrapped",
    targetType: "platform_admin_user",
    targetId: userId,
    metadata: { createdAt: now }
  });

  return normalizePlatformAdminUser(data);
}

export async function getPlatformAdminAuthStatus(): Promise<PlatformAdminAuthStatus> {
  const hasConfiguredPassword = Boolean(process.env.PLATFORM_ADMIN_PASSWORD?.trim());
  const production = process.env.NODE_ENV === "production";
  const [credential, availability] = await Promise.all([getStoredCredential(), getAdminUserAvailability()]);
  const storedPasswordConfigured = Boolean(credential);
  const adminUsersConfigured = availability.configured && availability.count > 0;

  return {
    configured: adminUsersConfigured || storedPasswordConfigured || hasConfiguredPassword || !production,
    production,
    devFallbackEnabled: !adminUsersConfigured && !storedPasswordConfigured && !hasConfiguredPassword && !production,
    sessionTtlHours: Math.round(sessionTtlMs / 60 / 60 / 1000),
    storedPasswordConfigured,
    requiresFirstPasswordChange: !adminUsersConfigured && !storedPasswordConfigured && (hasConfiguredPassword || !production),
    rbacConfigured: availability.configured,
    adminUsersConfigured,
    bootstrapFallbackEnabled: !adminUsersConfigured && (storedPasswordConfigured || hasConfiguredPassword || !production)
  };
}

export async function verifyPlatformAdminPassword(
  input: string | { email?: string | null; password: string }
): Promise<PlatformAdminVerification> {
  const password = typeof input === "string" ? input : input.password;
  const email = typeof input === "string" ? "" : normalizeEmail(input.email);
  const availability = await getAdminUserAvailability();

  if (email) {
    const user = await getStoredAdminUserByEmail(email);
    if (user) {
      const permissions = await getRolePermissions(user.role);
      return {
        ok: user.status === "active" && verifyPasswordHash(password, user.password_salt, user.password_hash),
        mustChangePassword: user.must_change_password,
        user,
        permissions
      };
    }

    if (availability.configured && availability.count > 0) {
      return { ok: false, mustChangePassword: false };
    }
  } else if (availability.configured && availability.count > 0) {
    return { ok: false, mustChangePassword: false };
  }

  const credential = await getStoredCredential();
  if (credential) {
    const ok = verifyPasswordHash(password, credential.password_salt, credential.password_hash);
    const user = ok && email
      ? await createBootstrapOwnerFromLegacyPassword({ email, password, mustChangePassword: credential.must_change_password })
      : null;
    return {
      ok,
      mustChangePassword: user?.must_change_password ?? credential.must_change_password,
      user,
      permissions: user ? await getRolePermissions(user.role) : undefined
    };
  }

  const expected = getExpectedPassword();
  if (!expected) return { ok: false, mustChangePassword: false };
  const ok = safeEqual(password, expected);
  const user = ok && email
    ? await createBootstrapOwnerFromLegacyPassword({ email, password, mustChangePassword: true })
    : null;

  return {
    ok,
    mustChangePassword: user?.must_change_password ?? true,
    user,
    permissions: user ? await getRolePermissions(user.role) : undefined
  };
}

export async function changePlatformAdminPassword({
  currentPassword,
  newPassword
}: {
  currentPassword: string;
  newPassword: string;
}) {
  const session = await getPlatformAdminSession();

  if (session.userId) {
    const user = await getStoredAdminUserById(session.userId);
    if (!user || !verifyPasswordHash(currentPassword, user.password_salt, user.password_hash)) return false;

    const supabase = createAdminSupabaseClient() as any;
    const next = hashPassword(newPassword);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("platform_admin_users")
      .update({
        password_hash: next.hash,
        password_salt: next.salt,
        must_change_password: false,
        updated_by: session.actor,
        updated_at: now
      })
      .eq("id", user.id);

    if (error) throw error;

    await writePlatformAuditLog({
      actor: session.actor,
      action: "platform_admin_user_password_changed",
      targetType: "platform_admin_user",
      targetId: user.id,
      metadata: { changedAt: now }
    });

    await writeSessionEvent({
      sessionId: session.sessionId,
      userId: user.id,
      event: "password_changed",
      metadata: { changedAt: now }
    });
    return true;
  }

  const verification = await verifyPlatformAdminPassword(currentPassword);
  if (!verification.ok) return false;
  await writePlatformAdminPassword(newPassword, session.actor);
  return true;
}

export async function createPlatformAdminSession({
  mustChangePassword = false,
  user,
  permissions
}: {
  mustChangePassword?: boolean;
  user?: PlatformAdminSessionUser | null;
  permissions?: PlatformAdminPermission[];
} = {}) {
  const cookieStore = await cookies();
  const issuedAt = Date.now().toString();
  const state = mustChangePassword ? "change" : "ok";

  if (user) {
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    const supabase = createAdminSupabaseClient() as any;
    const { error } = await supabase.from("platform_admin_sessions").insert({
      id: sessionId,
      user_id: user.id,
      role: user.role,
      issued_at: new Date(Number(issuedAt)).toISOString(),
      expires_at: expiresAt,
      metadata: { permissions: permissions ?? (await getRolePermissions(user.role)) }
    });

    if (error) {
      if (!isMissingSchemaError(error)) throw error;
    } else {
      await supabase.from("platform_admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);
      await writeSessionEvent({
        sessionId,
        userId: user.id,
        event: "login",
        metadata: { role: user.role }
      });
      const signature = sign(`${sessionId}.${issuedAt}.${state}`);
      cookieStore.set(cookieName, `v2.${sessionId}.${issuedAt}.${state}.${signature}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: cookiePath,
        maxAge: Math.floor(sessionTtlMs / 1000)
      });
      return;
    }
  }

  const signature = sign(`${issuedAt}.${state}`);
  cookieStore.set(cookieName, `${issuedAt}.${state}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: cookiePath,
    maxAge: Math.floor(sessionTtlMs / 1000)
  });
}

export async function clearPlatformAdminSession() {
  const session = await getPlatformAdminSession();
  if (session.sessionId) {
    const supabase = createAdminSupabaseClient() as any;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("platform_admin_sessions")
      .update({
        revoked_at: now,
        revoked_by: session.actor,
        revoked_reason: "logout"
      })
      .eq("id", session.sessionId)
      .is("revoked_at", null);

    if (error && !isMissingSchemaError(error)) throw error;
    await writeSessionEvent({
      sessionId: session.sessionId,
      userId: session.userId,
      event: "logout",
      metadata: { loggedOutAt: now }
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: cookiePath,
    maxAge: 0,
    expires: new Date(0)
  });
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: legacyCookiePath,
    maxAge: 0,
    expires: new Date(0)
  });
}

async function writeSessionEvent({
  sessionId,
  userId,
  event,
  metadata = {}
}: {
  sessionId?: string | null;
  userId?: string | null;
  event: "login" | "logout" | "password_changed" | "session_revoked" | "login_failed";
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createAdminSupabaseClient() as any;
    const { error } = await supabase.from("platform_admin_session_events").insert({
      session_id: sessionId ?? null,
      user_id: userId ?? null,
      event,
      metadata
    });
    if (error && !isMissingSchemaError(error)) throw error;
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
  }
}

async function readVersionedSession(parts: string[]): Promise<PlatformAdminSession> {
  const [, sessionId, issuedAt, state, signature] = parts;
  if (!sessionId || !issuedAt || !signature) return unauthenticatedSession;
  if (Date.now() - Number(issuedAt) > sessionTtlMs) return unauthenticatedSession;

  const expected = sign(`${sessionId}.${issuedAt}.${state}`);
  if (!expected || !safeEqual(signature, expected)) return unauthenticatedSession;

  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("platform_admin_sessions")
    .select("id,user_id,role,issued_at,expires_at,revoked_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) return unauthenticatedSession;
    throw error;
  }

  const row = data as PlatformAdminSessionRow | null;
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return unauthenticatedSession;

  const role = isPlatformAdminRole(row.role) ? row.role : "readonly";
  const user = await getStoredAdminUserById(row.user_id);
  if (!user || user.status !== "active") return unauthenticatedSession;

  const permissions = await getRolePermissions(role);
  return {
    authenticated: true,
    mustChangePassword: state === "change" || user.must_change_password,
    issuedAt: Number(issuedAt),
    sessionId,
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    role,
    permissions,
    actor: user.email
  };
}

export async function getPlatformAdminSession(): Promise<PlatformAdminSession> {
  const status = await getPlatformAdminAuthStatus();
  if (!status.configured) return unauthenticatedSession;

  const cookieStore = await cookies();
  const value = cookieStore.get(cookieName)?.value;
  if (!value) return unauthenticatedSession;

  const parts = value.split(".");
  if (parts[0] === "v2") return readVersionedSession(parts);
  if (shouldRejectLegacySession(status)) return unauthenticatedSession;

  const issuedAt = parts[0];
  const state = parts.length === 3 ? parts[1] : "ok";
  const signature = parts.length === 3 ? parts[2] : parts[1];
  if (!issuedAt || !signature) return unauthenticatedSession;
  if (Date.now() - Number(issuedAt) > sessionTtlMs) return unauthenticatedSession;

  const expected = parts.length === 3 ? sign(`${issuedAt}.${state}`) : sign(issuedAt);
  if (!expected) return unauthenticatedSession;

  const authenticated = safeEqual(signature, expected);
  return {
    authenticated,
    mustChangePassword: authenticated && state === "change",
    issuedAt: authenticated ? Number(issuedAt) : null,
    sessionId: null,
    userId: null,
    email: null,
    displayName: null,
    role: "owner",
    permissions: authenticated ? [...ownerPermissions] : [],
    actor: "platform-admin"
  };
}

export function hasPlatformAdminPermission(session: PlatformAdminSession, permission: PlatformAdminPermission) {
  return session.authenticated && !session.mustChangePassword && session.permissions.includes(permission);
}

export async function requirePlatformAdminPermission(permission: PlatformAdminPermission = "platform.read") {
  const session = await getPlatformAdminSession();
  if (!hasPlatformAdminPermission(session, permission)) {
    redirect(session.authenticated && session.mustChangePassword ? "/change-password" : "/");
  }
  return session;
}

export async function isPlatformAdminAuthenticated({ allowPasswordChange = false }: { allowPasswordChange?: boolean } = {}) {
  const session = await getPlatformAdminSession();
  return session.authenticated && (allowPasswordChange || !session.mustChangePassword);
}

export type {
  PlatformAdminAuthStatus,
  PlatformAdminPermission,
  PlatformAdminRole,
  PlatformAdminSession
};
