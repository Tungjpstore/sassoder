import 'server-only';

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { createLogimailServiceStore, normalizeDomain, normalizeEmail, supabaseErrorMessage } from '@/lib/logimail-store';

export type SecurityCodePurpose = 'account_access' | 'account_signup' | 'password_reset';

type SecurityCodeRow = {
  id: string;
  domain: string | null;
  purpose: SecurityCodePurpose;
  code_hash: string;
  code_ciphertext: string | null;
  code_hint: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  max_uses: number;
  used_count: number;
  expires_at: string;
  created_by: string | null;
  consumed_by_user_id: string | null;
  consumed_email: string | null;
  consumed_at: string | null;
  replaced_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RegistrationDomainRow = {
  domain: string;
};

type CreateSecurityCodeInput = {
  domain?: string | null;
  purpose?: SecurityCodePurpose;
  createdBy?: string;
  ttlHours?: number;
  metadata?: Record<string, unknown>;
};

type ConsumeSecurityCodeInput = {
  code: string;
  domain: string;
  email: string;
  userId?: string | null;
  purpose: Exclude<SecurityCodePurpose, 'account_access'>;
};

type ValidateSecurityCodeInput = {
  code: string;
  domain: string;
  purpose: Exclude<SecurityCodePurpose, 'account_access'>;
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_TTL_HOURS = 24;

function securityCodeSecret() {
  const secret = process.env.LOGIMAIL_SECURITY_CODE_SECRET || '';
  if (secret.length < 16) throw new Error('missing_security_code_secret');
  return secret;
}

function encryptionKey() {
  return createHash('sha256').update(securityCodeSecret()).digest();
}

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('security_codes_not_configured');
  return client;
}

export function normalizeSecurityCode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length < 8 || normalized.length > 32) throw new Error('invalid_security_code');
  return normalized;
}

export function securityCodeHash(code: string) {
  return createHmac('sha256', securityCodeSecret()).update(normalizeSecurityCode(code)).digest('hex');
}

function generateRawCode() {
  let value = 'LM';
  const bytes = randomBytes(10);
  for (let index = 0; index < 10; index += 1) {
    value += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return `${value.slice(0, 2)}-${value.slice(2, 6)}-${value.slice(6, 10)}-${value.slice(10)}`;
}

function encryptCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptCode(value: string | null) {
  if (!value) return null;
  try {
    const [ivText, tagText, encryptedText] = value.split('.');
    if (!ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function codeHint(code: string) {
  return normalizeSecurityCode(code).slice(-4);
}

function metadataWith(base: unknown, next: Record<string, unknown>) {
  const current = base && typeof base === 'object' && !Array.isArray(base) ? base as Record<string, unknown> : {};
  return { ...current, ...next };
}

function ttlHours(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_TTL_HOURS;
  return Math.min(168, Math.max(1, Math.round(Number(value))));
}

function matchesPurpose(rowPurpose: SecurityCodePurpose, requested: ConsumeSecurityCodeInput['purpose']) {
  return rowPurpose === requested;
}

function matchesDomain(rowDomain: string | null, requestedDomain: string) {
  return !rowDomain || rowDomain === requestedDomain;
}

export function publicSecurityCodeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'invalid_security_code');
  if (message === 'invalid_security_code') return 'Mã bảo mật không hợp lệ.';
  if (message === 'missing_security_code_secret') return 'Chưa cấu hình khóa bảo mật cho mã đăng ký.';
  if (message === 'security_codes_not_configured') return 'Chưa cấu hình service role cho mã bảo mật LogiMail.';
  return message;
}

export async function createSecurityCode(input: CreateSecurityCodeInput = {}) {
  const domain = input.domain ? normalizeDomain(input.domain) : null;
  const purpose = input.purpose ?? 'account_signup';
  const expiresAt = new Date(Date.now() + ttlHours(input.ttlHours) * 60 * 60 * 1000).toISOString();

  await revokeActiveSiblingSecurityCodes({ domain, purpose, actor: input.createdBy ?? 'logimail-system' });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRawCode();
    const row = {
      domain,
      purpose,
      code_hash: securityCodeHash(code),
      code_ciphertext: encryptCode(code),
      code_hint: codeHint(code),
      status: 'active',
      max_uses: 1,
      used_count: 0,
      expires_at: expiresAt,
      created_by: input.createdBy ?? 'logimail-system',
      metadata: input.metadata ?? {},
    };

    const { data, error } = await store().from('security_codes').insert(row).select('*').single();
    if (!error && data) return { row: data as SecurityCodeRow, code };
    if (error?.code !== '23505') throw new Error(supabaseErrorMessage(error));
  }

  throw new Error('security_code_generation_failed');
}

async function revokeActiveSiblingSecurityCodes(input: { domain: string | null; purpose: SecurityCodePurpose; actor: string }) {
  const query = store()
    .from('security_codes')
    .update({
      status: 'revoked',
      revoked_by: input.actor,
      revoked_at: new Date().toISOString(),
      metadata: { revokedBy: input.actor, revokedReason: 'replaced_by_new_active_code' },
    })
    .eq('status', 'active')
    .eq('purpose', input.purpose);
  const { error } = input.domain ? await query.eq('domain', input.domain) : await query.is('domain', null);
  if (error) throw new Error(supabaseErrorMessage(error));
}

async function markExpired(row: SecurityCodeRow, actor: string) {
  if (row.purpose === 'account_access') {
    await store()
      .from('security_codes')
      .update({
        status: 'revoked',
        revoked_by: actor,
        revoked_at: new Date().toISOString(),
        metadata: metadataWith(row.metadata, { revokedBy: actor, revokedReason: 'deprecated_account_access' }),
      })
      .eq('id', row.id)
      .eq('status', 'active');
    return null;
  }

  const { data, error } = await store()
    .from('security_codes')
    .update({ status: 'expired', metadata: metadataWith(row.metadata, { expiredBy: actor, expiredAt: new Date().toISOString() }) })
    .eq('id', row.id)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) return null;
  const replacement = await createSecurityCode({
    domain: row.domain,
    purpose: row.purpose,
    createdBy: actor,
    metadata: { replacedFrom: row.id, replacementReason: 'expired' },
  });
  await store().from('security_codes').update({ replaced_by: replacement.row.id }).eq('id', row.id);
  return replacement;
}

export async function consumeSecurityCode(input: ConsumeSecurityCodeInput) {
  const domain = normalizeDomain(input.domain);
  const email = normalizeEmail(input.email);
  const codeHash = securityCodeHash(input.code);
  const now = new Date().toISOString();

  const { data: rowData, error: lookupError } = await store()
    .from('security_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .maybeSingle();
  if (lookupError) throw new Error(supabaseErrorMessage(lookupError));
  if (!rowData) return { ok: false as const, reason: 'invalid' as const };

  const row = rowData as SecurityCodeRow;
  if (!matchesPurpose(row.purpose, input.purpose) || !matchesDomain(row.domain, domain)) {
    return { ok: false as const, reason: 'invalid' as const };
  }

  if (row.status === 'active' && new Date(row.expires_at).getTime() <= Date.now()) {
    await markExpired(row, 'logimail-auto-rotate');
    return { ok: false as const, reason: 'expired' as const };
  }

  if (row.status !== 'active' || row.used_count >= row.max_uses) {
    return { ok: false as const, reason: row.status === 'expired' ? 'expired' as const : 'used' as const };
  }

  const { data: consumedData, error: consumeError } = await store()
    .from('security_codes')
    .update({
      status: 'used',
      used_count: row.used_count + 1,
      consumed_by_user_id: input.userId ?? null,
      consumed_email: email,
      consumed_at: now,
      metadata: metadataWith(row.metadata, { consumedFor: input.purpose, consumedDomain: domain }),
    })
    .eq('id', row.id)
    .eq('status', 'active')
    .eq('used_count', row.used_count)
    .select('*')
    .maybeSingle();
  if (consumeError) throw new Error(supabaseErrorMessage(consumeError));
  if (!consumedData) return { ok: false as const, reason: 'used' as const };

  const replacement = await createSecurityCode({
    domain: row.domain,
    purpose: row.purpose,
    createdBy: 'logimail-auto-rotate',
    metadata: { replacedFrom: row.id, replacementReason: 'consumed' },
  });
  await store().from('security_codes').update({ replaced_by: replacement.row.id }).eq('id', row.id);

  return { ok: true as const, row: consumedData as SecurityCodeRow, replacement };
}

export async function validateSecurityCode(input: ValidateSecurityCodeInput) {
  const domain = normalizeDomain(input.domain);
  const codeHash = securityCodeHash(input.code);

  const { data: rowData, error: lookupError } = await store()
    .from('security_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .maybeSingle();
  if (lookupError) throw new Error(supabaseErrorMessage(lookupError));
  if (!rowData) return { ok: false as const, reason: 'invalid' as const };

  const row = rowData as SecurityCodeRow;
  if (!matchesPurpose(row.purpose, input.purpose) || !matchesDomain(row.domain, domain)) {
    return { ok: false as const, reason: 'invalid' as const };
  }

  if (row.status === 'active' && new Date(row.expires_at).getTime() <= Date.now()) {
    await markExpired(row, 'logimail-auto-rotate');
    return { ok: false as const, reason: 'expired' as const };
  }

  if (row.status !== 'active' || row.used_count >= row.max_uses) {
    return { ok: false as const, reason: row.status === 'expired' ? 'expired' as const : 'used' as const };
  }

  return { ok: true as const, row };
}

export async function rotateExpiredSecurityCodes(actor = 'logimail-auto-rotate') {
  const { data, error } = await store()
    .from('security_codes')
    .select('*')
    .eq('status', 'active')
    .neq('purpose', 'account_access')
    .lte('expires_at', new Date().toISOString())
    .limit(25);
  if (error) throw new Error(supabaseErrorMessage(error));

  const replacements: Array<{ id: string; code: string; domain: string | null; expiresAt: string }> = [];
  for (const row of (data ?? []) as SecurityCodeRow[]) {
    const replacement = await markExpired(row, actor);
    if (replacement) replacements.push({ id: replacement.row.id, code: replacement.code, domain: replacement.row.domain, expiresAt: replacement.row.expires_at });
  }
  return replacements;
}

export async function runSecurityCodeMaintenance(input: { actor?: string; retentionHours?: number } = {}) {
  const actor = input.actor ?? 'logimail-maintenance';
  const revokedDeprecated = await revokeDeprecatedAccessCodes(actor);
  const replacements = await rotateExpiredSecurityCodes(actor);
  const ensuredSignupCodes = await ensureActiveSignupCodes(actor);
  const pruned = await pruneInactiveSecurityCodes(input.retentionHours);
  return { rotated: replacements.length, ensured: ensuredSignupCodes.length, pruned, revokedDeprecated, generatedAt: new Date().toISOString() };
}

async function ensureActiveSignupCodes(actor: string) {
  const { data, error } = await store()
    .from('domains')
    .select('domain')
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .eq('registration_enabled', true);
  if (error) throw new Error(supabaseErrorMessage(error));

  const ensured: Array<{ id: string; domain: string | null; expiresAt: string }> = [];
  const now = new Date().toISOString();
  for (const row of (data ?? []) as RegistrationDomainRow[]) {
    const domain = normalizeDomain(row.domain);
    const { data: activeRows, error: activeError } = await store()
      .from('security_codes')
      .select('id')
      .eq('domain', domain)
      .eq('purpose', 'account_signup')
      .eq('status', 'active')
      .gt('expires_at', now)
      .limit(1);
    if (activeError) throw new Error(supabaseErrorMessage(activeError));
    if ((activeRows ?? []).length > 0) continue;

    const replacement = await createSecurityCode({
      domain,
      purpose: 'account_signup',
      createdBy: actor,
      metadata: { replacementReason: 'maintenance_ensure_active' },
    });
    ensured.push({ id: replacement.row.id, domain: replacement.row.domain, expiresAt: replacement.row.expires_at });
  }
  return ensured;
}

async function revokeDeprecatedAccessCodes(actor: string) {
  const { data, error } = await store()
    .from('security_codes')
    .update({
      status: 'revoked',
      revoked_by: actor,
      revoked_at: new Date().toISOString(),
      metadata: { revokedBy: actor, revokedReason: 'deprecated_account_access' },
    })
    .eq('status', 'active')
    .eq('purpose', 'account_access')
    .select('id');
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).length;
}

async function pruneInactiveSecurityCodes(retentionHours?: number) {
  const cutoff = new Date(Date.now() - retentionHoursValue(retentionHours) * 60 * 60 * 1000).toISOString();
  const { data, error } = await store()
    .from('security_codes')
    .delete()
    .in('status', ['used', 'expired', 'revoked'])
    .lt('updated_at', cutoff)
    .select('id');
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).length;
}

function retentionHoursValue(value?: number) {
  const explicit = value ?? Number(process.env.LOGIMAIL_SECURITY_CODE_RETENTION_HOURS ?? 1);
  if (!Number.isFinite(explicit)) return 1;
  return Math.min(720, Math.max(0, Math.round(Number(explicit))));
}

export function displayCodeFromRow(row: Pick<SecurityCodeRow, 'code_ciphertext' | 'code_hint'>) {
  return decryptCode(row.code_ciphertext) ?? (row.code_hint ? `••••-${row.code_hint}` : null);
}

export type SecurityCodeView = {
  id: string;
  domain: string | null;
  purpose: SecurityCodePurpose;
  code: string | null;
  codeHint: string;
  status: SecurityCodeRow['status'];
  usedCount: number;
  maxUses: number;
  expiresAt: string;
  createdAt: string;
  consumedEmail: string | null;
};

export async function listActiveSecurityCodes(limit = 50): Promise<SecurityCodeView[]> {
  const { data, error } = await store()
    .from('security_codes')
    .select('*')
    .eq('status', 'active')
    .order('expires_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(supabaseErrorMessage(error));
  return ((data ?? []) as SecurityCodeRow[]).map((row) => ({
    id: row.id,
    domain: row.domain,
    purpose: row.purpose,
    code: displayCodeFromRow(row),
    codeHint: row.code_hint,
    status: row.status,
    usedCount: row.used_count,
    maxUses: row.max_uses,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    consumedEmail: row.consumed_email,
  }));
}

async function getSecurityCodeById(id: string) {
  const { data, error } = await store().from('security_codes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data as SecurityCodeRow | null) ?? null;
}

export async function rotateSecurityCode(input: { codeId: string; actor: string }) {
  const current = await getSecurityCodeById(input.codeId);
  if (!current) throw new Error('security_code_not_found');
  if (current.status === 'active') {
    const { data, error } = await store()
      .from('security_codes')
      .update({ status: 'revoked', revoked_by: input.actor, revoked_at: new Date().toISOString(), metadata: metadataWith(current.metadata, { revokedReason: 'rotated' }) })
      .eq('id', current.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();
    if (error) throw new Error(supabaseErrorMessage(error));
    if (!data) throw new Error('security_code_inactive');
  }
  const replacement = await createSecurityCode({
    domain: current.domain,
    purpose: current.purpose,
    createdBy: input.actor,
    metadata: { replacedFrom: current.id, replacementReason: 'manual_rotate' },
  });
  await store().from('security_codes').update({ replaced_by: replacement.row.id }).eq('id', current.id);
  return { id: replacement.row.id, code: replacement.code, domain: replacement.row.domain, expiresAt: replacement.row.expires_at };
}

export async function revokeSecurityCode(input: { codeId: string; actor: string }) {
  const current = await getSecurityCodeById(input.codeId);
  if (!current) throw new Error('security_code_not_found');
  const { data, error } = await store()
    .from('security_codes')
    .update({ status: 'revoked', revoked_by: input.actor, revoked_at: new Date().toISOString(), metadata: metadataWith(current.metadata, { revokedReason: 'manual_revoke' }) })
    .eq('id', input.codeId)
    .in('status', ['active', 'expired'])
    .select('id')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('security_code_inactive');
  return { codeId: input.codeId, status: 'revoked' as const };
}
