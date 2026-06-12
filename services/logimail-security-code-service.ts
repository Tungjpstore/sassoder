import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type LogimailSecurityCodePurpose = "account_access" | "account_signup" | "password_reset";

export type LogimailSecurityCodeView = {
  id: string;
  domain: string | null;
  purpose: LogimailSecurityCodePurpose;
  code: string | null;
  codeHint: string;
  status: "active" | "used" | "expired" | "revoked";
  usedCount: number;
  maxUses: number;
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  consumedEmail: string | null;
  consumedAt: string | null;
  replacedBy: string | null;
};

export type LogimailSecurityCodeCenter = {
  schemaReady: boolean;
  generatedAt: string;
  summary: {
    active: number;
    used: number;
    expired: number;
    revoked: number;
    expiringSoon: number;
  };
  codes: LogimailSecurityCodeView[];
  warnings: string[];
};

type SecurityCodeRow = {
  id: string;
  domain: string | null;
  purpose: LogimailSecurityCodePurpose;
  code_hash: string;
  code_ciphertext: string | null;
  code_hint: string;
  status: "active" | "used" | "expired" | "revoked";
  max_uses: number;
  used_count: number;
  expires_at: string;
  created_by: string | null;
  consumed_email: string | null;
  consumed_at: string | null;
  replaced_by: string | null;
  metadata: unknown;
  created_at: string;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function emptySecurityCodeCenter(warnings: string[] = []): LogimailSecurityCodeCenter {
  return {
    schemaReady: false,
    generatedAt: new Date().toISOString(),
    summary: { active: 0, used: 0, expired: 0, revoked: 0, expiringSoon: 0 },
    codes: [],
    warnings
  };
}

export async function getLogimailSecurityCodeCenter(limit = 24): Promise<LogimailSecurityCodeCenter> {
  try {
    await runLogimailSecurityCodeMaintenance({ actor: "admin.logivn.com:auto" });
    const [{ data, error }, summaryResult] = await Promise.all([
      logimailDb()
      .from("security_codes")
      .select("id,domain,purpose,code_hash,code_ciphertext,code_hint,status,max_uses,used_count,expires_at,created_by,consumed_email,consumed_at,replaced_by,metadata,created_at")
      .eq("status", "active")
      .order("expires_at", { ascending: true })
      .limit(limit),
      logimailDb()
        .from("security_codes")
        .select("status,expires_at,created_at")
        .order("created_at", { ascending: false })
        .limit(500)
    ]);
    if (isMissingLogimailSecurityCodeSchema(error)) return emptySecurityCodeCenter(["Thiếu bảng logimail.security_codes."]);
    if (error) throw error;
    if (summaryResult.error && !isMissingLogimailSecurityCodeSchema(summaryResult.error)) throw summaryResult.error;

    const rows = (data ?? []) as SecurityCodeRow[];
    const summaryRows = ((summaryResult.data ?? rows) as Array<Pick<SecurityCodeRow, "status" | "expires_at">>);
    const soonCutoff = Date.now() + 2 * 60 * 60 * 1000;
    return {
      schemaReady: true,
      generatedAt: new Date().toISOString(),
      summary: {
        active: summaryRows.filter((row) => row.status === "active").length,
        used: summaryRows.filter((row) => row.status === "used").length,
        expired: summaryRows.filter((row) => row.status === "expired").length,
        revoked: summaryRows.filter((row) => row.status === "revoked").length,
        expiringSoon: summaryRows.filter((row) => row.status === "active" && new Date(row.expires_at).getTime() <= soonCutoff).length
      },
      codes: rows.map(mapSecurityCodeRow),
      warnings: []
    };
  } catch (error) {
    if (isMissingLogimailSecurityCodeSchema(error)) return emptySecurityCodeCenter(["Thiếu bảng logimail.security_codes."]);
    throw error;
  }
}

export async function createLogimailSecurityCodeForAdmin(input: { domain?: string | null; actor: string; ttlHours?: number; purpose?: LogimailSecurityCodePurpose }) {
  return createSecurityCode({
    domain: input.domain ? normalizeDomain(input.domain) : await defaultSecurityCodeDomain(),
    purpose: input.purpose ?? "account_signup",
    actor: input.actor,
    ttlHours: input.ttlHours,
    metadata: { source: "admin.logivn.com" }
  });
}

export async function rotateLogimailSecurityCodeForAdmin(input: { codeId: string; actor: string }) {
  const current = await getSecurityCodeById(input.codeId);
  if (!current) throw new Error("Không tìm thấy mã bảo mật LogiMail.");
  if (current.status === "active") {
    const { data, error } = await logimailDb()
      .from("security_codes")
      .update({ status: "revoked", revoked_by: input.actor, revoked_at: new Date().toISOString(), metadata: { ...asRecord(current.metadata), revokedReason: "rotated" } })
      .eq("id", current.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Mã bảo mật không còn hiệu lực để đổi.");
  }
  const replacement = await createSecurityCode({
    domain: current.domain,
    purpose: current.purpose,
    actor: input.actor,
    metadata: { source: "admin.logivn.com", replacedFrom: current.id, replacementReason: "manual_rotate" }
  });
  await logimailDb().from("security_codes").update({ replaced_by: replacement.row.id }).eq("id", current.id).then(throwOnError);
  return replacement;
}

export async function revokeLogimailSecurityCodeForAdmin(input: { codeId: string; actor: string }) {
  const current = await getSecurityCodeById(input.codeId);
  if (!current) throw new Error("Không tìm thấy mã bảo mật LogiMail.");
  const { data, error } = await logimailDb()
    .from("security_codes")
    .update({ status: "revoked", revoked_by: input.actor, revoked_at: new Date().toISOString(), metadata: { ...asRecord(current.metadata), revokedReason: "manual_revoke" } })
    .eq("id", input.codeId)
    .in("status", ["active", "expired"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mã bảo mật không còn hiệu lực để xoá.");
  return { codeId: input.codeId, status: "revoked" as const };
}

export async function runLogimailSecurityCodeMaintenance(input: { actor?: string; retentionHours?: number } = {}) {
  const actor = input.actor ?? "logimail-security-code-maintenance";
  const revokedDeprecated = await revokeDeprecatedAccessCodes(actor);
  const [rotated, pruned] = await Promise.all([
    rotateExpiredLogimailSecurityCodes(actor),
    pruneInactiveLogimailSecurityCodes(input.retentionHours)
  ]);
  return {
    rotated: rotated.length,
    pruned,
    revokedDeprecated,
    generatedAt: new Date().toISOString()
  };
}

async function revokeDeprecatedAccessCodes(actor: string) {
  const { data, error } = await logimailDb()
    .from("security_codes")
    .update({ status: "revoked", revoked_by: actor, revoked_at: new Date().toISOString(), metadata: { revokedBy: actor, revokedReason: "deprecated_account_access" } })
    .eq("status", "active")
    .eq("purpose", "account_access")
    .select("id");
  if (isMissingLogimailSecurityCodeSchema(error)) return 0;
  if (error) throw error;
  return (data ?? []).length;
}

async function rotateExpiredLogimailSecurityCodes(actor: string) {
  const { data, error } = await logimailDb()
    .from("security_codes")
    .select("id,domain,purpose,code_hash,code_ciphertext,code_hint,status,max_uses,used_count,expires_at,created_by,consumed_email,consumed_at,replaced_by,metadata,created_at")
    .eq("status", "active")
    .neq("purpose", "account_access")
    .lte("expires_at", new Date().toISOString())
    .limit(25);
  if (isMissingLogimailSecurityCodeSchema(error)) return [];
  if (error) throw error;

  const replacements: Awaited<ReturnType<typeof createSecurityCode>>[] = [];
  for (const row of (data ?? []) as SecurityCodeRow[]) {
    const { data: expired, error: updateError } = await logimailDb()
      .from("security_codes")
      .update({ status: "expired", metadata: { ...asRecord(row.metadata), expiredBy: actor, expiredAt: new Date().toISOString() } })
      .eq("id", row.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!expired) continue;
    const replacement = await createSecurityCode({
      domain: row.domain,
      purpose: row.purpose,
      actor,
      metadata: { source: actor, replacedFrom: row.id, replacementReason: "expired" }
    });
    await logimailDb().from("security_codes").update({ replaced_by: replacement.row.id }).eq("id", row.id).then(throwOnError);
    replacements.push(replacement);
  }
  return replacements;
}

async function createSecurityCode(input: { domain: string | null; purpose: LogimailSecurityCodePurpose; actor: string; ttlHours?: number; metadata?: Record<string, unknown> }) {
  await revokeActiveSiblingSecurityCodes(input.domain, input.purpose, input.actor);
  const expiresAt = new Date(Date.now() + normalizeTtlHours(input.ttlHours) * 60 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRawCode();
    const { data, error } = await logimailDb()
      .from("security_codes")
      .insert({
        domain: input.domain,
        purpose: input.purpose,
        code_hash: securityCodeHash(code),
        code_ciphertext: encryptCode(code),
        code_hint: codeHint(code),
        status: "active",
        max_uses: 1,
        used_count: 0,
        expires_at: expiresAt,
        created_by: input.actor,
        metadata: input.metadata ?? {}
      })
      .select("id,domain,purpose,code_hash,code_ciphertext,code_hint,status,max_uses,used_count,expires_at,created_by,consumed_email,consumed_at,replaced_by,metadata,created_at")
      .single();
    if (!error && data) return { row: data as SecurityCodeRow, code };
    if (error?.code !== "23505") throw error;
  }
  throw new Error("Không tạo được mã bảo mật LogiMail.");
}

async function revokeActiveSiblingSecurityCodes(domain: string | null, purpose: LogimailSecurityCodePurpose, actor: string) {
  const query = logimailDb()
    .from("security_codes")
    .update({ status: "revoked", revoked_by: actor, revoked_at: new Date().toISOString(), metadata: { revokedBy: actor, revokedReason: "replaced_by_new_active_code" } })
    .eq("status", "active")
    .eq("purpose", purpose);
  const result = domain ? await query.eq("domain", domain) : await query.is("domain", null);
  if (result.error && !isMissingLogimailSecurityCodeSchema(result.error)) throw result.error;
}

async function pruneInactiveLogimailSecurityCodes(retentionHours?: number) {
  const cutoff = new Date(Date.now() - normalizeRetentionHours(retentionHours) * 60 * 60 * 1000).toISOString();
  const { data, error } = await logimailDb()
    .from("security_codes")
    .delete()
    .in("status", ["used", "expired", "revoked"])
    .lt("updated_at", cutoff)
    .select("id");
  if (isMissingLogimailSecurityCodeSchema(error)) return 0;
  if (error) throw error;
  return (data ?? []).length;
}

async function getSecurityCodeById(id: string) {
  const { data, error } = await logimailDb()
    .from("security_codes")
    .select("id,domain,purpose,code_hash,code_ciphertext,code_hint,status,max_uses,used_count,expires_at,created_by,consumed_email,consumed_at,replaced_by,metadata,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as SecurityCodeRow | null;
}

async function defaultSecurityCodeDomain() {
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
  const fallback = process.env.LOGIMAIL_DOMAIN || process.env.NEXT_PUBLIC_LOGIMAIL_DOMAIN || "logivn.com";
  return normalizeDomain(fallback);
}

function mapSecurityCodeRow(row: SecurityCodeRow): LogimailSecurityCodeView {
  return {
    id: row.id,
    domain: row.domain,
    purpose: row.purpose,
    code: decryptCode(row.code_ciphertext) ?? (row.code_hint ? `••••-${row.code_hint}` : null),
    codeHint: row.code_hint,
    status: row.status,
    usedCount: row.used_count,
    maxUses: row.max_uses,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    consumedEmail: row.consumed_email,
    consumedAt: row.consumed_at,
    replacedBy: row.replaced_by
  };
}

function logimailDb() {
  const client = createAdminSupabaseClient() as any;
  return typeof client.schema === "function" ? client.schema("logimail") : client;
}

function normalizeDomain(value: string) {
  const domain = value.trim().toLowerCase();
  if (!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) throw new Error("Domain email không hợp lệ.");
  return domain;
}

function normalizeSecurityCode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 8 || normalized.length > 32) throw new Error("Mã bảo mật không hợp lệ.");
  return normalized;
}

function securityCodeSecret() {
  const secret = process.env.LOGIMAIL_SECURITY_CODE_SECRET || "";
  if (secret.length < 16) throw new Error("Thiếu LOGIMAIL_SECURITY_CODE_SECRET.");
  return secret;
}

function encryptionKey() {
  return createHash("sha256").update(securityCodeSecret()).digest();
}

function securityCodeHash(code: string) {
  return createHmac("sha256", securityCodeSecret()).update(normalizeSecurityCode(code)).digest("hex");
}

function generateRawCode() {
  let value = "LM";
  const bytes = randomBytes(10);
  for (let index = 0; index < 10; index += 1) value += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  return `${value.slice(0, 2)}-${value.slice(2, 6)}-${value.slice(6, 10)}-${value.slice(10)}`;
}

function encryptCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptCode(value: string | null) {
  if (!value) return null;
  try {
    const [ivText, tagText, encryptedText] = value.split(".");
    if (!ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function codeHint(code: string) {
  return normalizeSecurityCode(code).slice(-4);
}

function normalizeTtlHours(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return 24;
  return Math.min(168, Math.max(1, Math.round(Number(value))));
}

function normalizeRetentionHours(value?: number) {
  const explicit = value ?? Number(process.env.LOGIMAIL_SECURITY_CODE_RETENTION_HOURS ?? 24);
  if (!Number.isFinite(explicit)) return 24;
  return Math.min(720, Math.max(1, Math.round(Number(explicit))));
}

function throwOnError(result: { error: unknown }) {
  if (result.error) throw result.error;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isMissingLogimailSecurityCodeSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return code === "42P01" || code === "42703" || code === "PGRST202" || code === "PGRST204" || code === "PGRST205" || /security_codes|Could not find|does not exist/i.test(message);
}
