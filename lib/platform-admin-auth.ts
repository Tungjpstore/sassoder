import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const cookieName = "logivn_platform_admin";
const sessionTtlMs = 12 * 60 * 60 * 1000;
const credentialId = "primary";

type PlatformAdminAuthStatus = {
  configured: boolean;
  production: boolean;
  devFallbackEnabled: boolean;
  sessionTtlHours: number;
  storedPasswordConfigured: boolean;
  requiresFirstPasswordChange: boolean;
};

type PlatformAdminSession = {
  authenticated: boolean;
  mustChangePassword: boolean;
  issuedAt: number | null;
};

type PlatformAdminCredentialRow = {
  id: string;
  password_hash: string;
  password_salt: string;
  must_change_password: boolean;
  updated_at: string;
};

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
    error.code === "PGRST205" ||
    error.message?.includes("does not exist") ||
    error.message?.includes("Could not find")
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

async function writePlatformAdminPassword(password: string) {
  const supabase = createAdminSupabaseClient() as any;
  const next = hashPassword(password);
  const now = new Date().toISOString();
  const { error } = await supabase.from("platform_admin_credentials").upsert({
    id: credentialId,
    password_hash: next.hash,
    password_salt: next.salt,
    must_change_password: false,
    updated_at: now,
    updated_by: "platform-admin"
  });

  if (error) throw error;

  await supabase.from("platform_audit_logs").insert({
    actor: "platform-admin",
    action: "platform_admin_password_changed",
    target_type: "platform_admin_credential",
    target_id: credentialId,
    metadata: { changedAt: now }
  });
}

export async function getPlatformAdminAuthStatus(): Promise<PlatformAdminAuthStatus> {
  const hasConfiguredPassword = Boolean(process.env.PLATFORM_ADMIN_PASSWORD?.trim());
  const production = process.env.NODE_ENV === "production";
  const credential = await getStoredCredential();
  const storedPasswordConfigured = Boolean(credential);

  return {
    configured: storedPasswordConfigured || hasConfiguredPassword || !production,
    production,
    devFallbackEnabled: !storedPasswordConfigured && !hasConfiguredPassword && !production,
    sessionTtlHours: Math.round(sessionTtlMs / 60 / 60 / 1000),
    storedPasswordConfigured,
    requiresFirstPasswordChange: !storedPasswordConfigured && (hasConfiguredPassword || !production)
  };
}

export async function verifyPlatformAdminPassword(password: string) {
  const credential = await getStoredCredential();
  if (credential) {
    return {
      ok: verifyPasswordHash(password, credential.password_salt, credential.password_hash),
      mustChangePassword: credential.must_change_password
    };
  }

  const expected = getExpectedPassword();
  if (!expected) return { ok: false, mustChangePassword: false };
  return {
    ok: safeEqual(password, expected),
    mustChangePassword: true
  };
}

export async function changePlatformAdminPassword({
  currentPassword,
  newPassword
}: {
  currentPassword: string;
  newPassword: string;
}) {
  const verification = await verifyPlatformAdminPassword(currentPassword);
  if (!verification.ok) return false;
  await writePlatformAdminPassword(newPassword);
  return true;
}

export async function createPlatformAdminSession({ mustChangePassword = false }: { mustChangePassword?: boolean } = {}) {
  const cookieStore = await cookies();
  const issuedAt = Date.now().toString();
  const state = mustChangePassword ? "change" : "ok";
  const signature = sign(`${issuedAt}.${state}`);

  cookieStore.set(cookieName, `${issuedAt}.${state}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: Math.floor(sessionTtlMs / 1000)
  });
}

export async function clearPlatformAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 0,
    expires: new Date(0)
  });
}

export async function getPlatformAdminSession(): Promise<PlatformAdminSession> {
  const status = await getPlatformAdminAuthStatus();
  if (!status.configured) return { authenticated: false, mustChangePassword: false, issuedAt: null };

  const cookieStore = await cookies();
  const value = cookieStore.get(cookieName)?.value;
  if (!value) return { authenticated: false, mustChangePassword: false, issuedAt: null };

  const parts = value.split(".");
  const issuedAt = parts[0];
  const state = parts.length === 3 ? parts[1] : "ok";
  const signature = parts.length === 3 ? parts[2] : parts[1];
  if (!issuedAt || !signature) return { authenticated: false, mustChangePassword: false, issuedAt: null };
  if (Date.now() - Number(issuedAt) > sessionTtlMs) return { authenticated: false, mustChangePassword: false, issuedAt: null };

  const expected = parts.length === 3 ? sign(`${issuedAt}.${state}`) : sign(issuedAt);
  if (!expected) return { authenticated: false, mustChangePassword: false, issuedAt: null };

  return {
    authenticated: safeEqual(signature, expected),
    mustChangePassword: state === "change",
    issuedAt: Number(issuedAt)
  };
}

export async function isPlatformAdminAuthenticated({ allowPasswordChange = false }: { allowPasswordChange?: boolean } = {}) {
  const session = await getPlatformAdminSession();
  return session.authenticated && (allowPasswordChange || !session.mustChangePassword);
}

export type { PlatformAdminAuthStatus, PlatformAdminSession };
