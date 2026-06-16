import 'server-only';

import { generateKeyPairSync } from 'node:crypto';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import {
  activeCredentialKeyVersion,
  decryptMailboxCredential,
  encryptMailboxCredential,
  mailCredentialReadiness,
} from '@/lib/mail-credentials';
import {
  canAddSelector,
  defaultSelectorName,
  dkimTxtContent,
  dkimTxtName,
} from '@/lib/deliverability/dkim-format';

// DKIM_Manager (Requirement 1, 14): CRUD selectors, obtain/generate key pairs,
// rotate while keeping the retired selector resolvable for 7 days. Private keys
// live encrypted in the Credential_Vault; only the public key is stored plainly.

export type KeySource = 'billionmail' | 'logimail';

export type DkimSelectorRecord = {
  id: string;
  domainId: string;
  selector: string;
  publicKey: string;
  keySource: KeySource;
  status: 'active' | 'retired';
  retiredAt: string | null;
  createdAt: string;
};

export type DkimTxtRecord = { name: string; type: 'TXT'; content: string };

const RETIRED_RESOLVABLE_DAYS = 7;

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('dkim_not_configured');
  return client;
}

type SelectorRow = {
  id: string;
  domain_id: string;
  selector: string;
  public_key: string;
  encrypted_private_key: string | null;
  credential_key_version: number | null;
  key_source: KeySource;
  status: 'active' | 'retired';
  retired_at: string | null;
  created_at: string;
};

function toRecord(row: SelectorRow): DkimSelectorRecord {
  return {
    id: row.id,
    domainId: row.domain_id,
    selector: row.selector,
    publicKey: row.public_key,
    keySource: row.key_source,
    status: row.status,
    retiredAt: row.retired_at,
    createdAt: row.created_at,
  };
}

async function fetchDomain(domainId: string) {
  const db = store();
  const { data, error } = await db.from('domains').select('id,workspace_id,domain').eq('id', domainId).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('domain_not_found');
  return data as { id: string; workspace_id: string; domain: string };
}

async function fetchSelectorRows(domainId: string): Promise<SelectorRow[]> {
  const db = store();
  const { data, error } = await db
    .from('dkim_selectors')
    .select('id,domain_id,selector,public_key,encrypted_private_key,credential_key_version,key_source,status,retired_at,created_at')
    .eq('domain_id', domainId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []) as SelectorRow[];
}

/** Generate an RSA-2048 key pair; returns base64 DER public key + PEM private key. */
function generateRsaKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { publicKeyBase64, privateKeyPem };
}

export async function listDkimSelectors(domainId: string): Promise<DkimSelectorRecord[]> {
  return (await fetchSelectorRows(domainId)).map(toRecord);
}

export async function getActiveSelector(domainId: string): Promise<DkimSelectorRecord | null> {
  const rows = await fetchSelectorRows(domainId);
  const active = rows.find((row) => row.status === 'active');
  return active ? toRecord(active) : null;
}

/** Published DKIM TXT record for the domain's active selector (R1.3). */
export async function getDkimTxtRecord(domainId: string): Promise<DkimTxtRecord | null> {
  const domain = await fetchDomain(domainId);
  const active = await getActiveSelector(domainId);
  if (!active) return null;
  return { name: dkimTxtName(active.selector, domain.domain), type: 'TXT', content: dkimTxtContent(active.publicKey) };
}

export type CreateSelectorInput = {
  domainId: string;
  selector?: string;
  keySource?: KeySource;
  /** Required when keySource is `billionmail`: BillionMail-managed public key (base64 DER). */
  billionmailPublicKey?: string;
  actor: string;
  actorId?: string | null;
};

export async function createDkimSelector(input: CreateSelectorInput): Promise<{ record: DkimSelectorRecord; txt: DkimTxtRecord }> {
  const keySource: KeySource = input.keySource ?? 'logimail';
  if (keySource === 'logimail' && !mailCredentialReadiness().ready) {
    throw new Error('missing_credential_encryption_key');
  }

  const db = store();
  const domain = await fetchDomain(input.domainId);
  const existing = await fetchSelectorRows(input.domainId);

  const selector = (input.selector ?? defaultSelectorName()).toLowerCase();
  const guard = canAddSelector(existing, selector);
  if (!guard.ok) throw new Error(guard.reason);

  let publicKeyBase64: string;
  let encryptedPrivateKey: string | null = null;
  let credentialKeyVersion: number | null = null;

  if (keySource === 'billionmail') {
    if (!input.billionmailPublicKey) throw new Error('missing_billionmail_public_key');
    publicKeyBase64 = input.billionmailPublicKey.replace(/\s+/g, '');
  } else {
    const pair = generateRsaKeyPair();
    publicKeyBase64 = pair.publicKeyBase64;
    credentialKeyVersion = activeCredentialKeyVersion();
    encryptedPrivateKey = encryptMailboxCredential(pair.privateKeyPem, credentialKeyVersion);
  }

  const { data, error } = await db
    .from('dkim_selectors')
    .insert({
      workspace_id: domain.workspace_id,
      domain_id: input.domainId,
      selector,
      public_key: publicKeyBase64,
      encrypted_private_key: encryptedPrivateKey,
      credential_key_version: credentialKeyVersion,
      key_source: keySource,
      status: 'active',
    })
    .select('id,domain_id,selector,public_key,encrypted_private_key,credential_key_version,key_source,status,retired_at,created_at')
    .maybeSingle();

  if (error) {
    // Unique (domain_id, selector) violation maps to a conflict (R1.4).
    if (error.code === '23505') throw new Error('dkim_selector_conflict');
    throw new Error(supabaseErrorMessage(error));
  }

  const record = toRecord(data as SelectorRow);
  await writeAuditLog({
    workspaceId: domain.workspace_id,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.dkim_selector_created',
    targetType: 'dkim_selector',
    targetId: record.id,
    metadata: { domainId: input.domainId, selector, keySource },
  });

  return { record, txt: { name: dkimTxtName(selector, domain.domain), type: 'TXT', content: dkimTxtContent(publicKeyBase64) } };
}

export async function deleteDkimSelector(input: { domainId: string; selectorId: string; actor: string; actorId?: string | null }) {
  const db = store();
  const { error } = await db.from('dkim_selectors').delete().eq('id', input.selectorId).eq('domain_id', input.domainId);
  if (error) throw new Error(supabaseErrorMessage(error));
  await writeAuditLog({
    actorId: input.actorId ?? input.actor,
    action: 'logimail.dkim_selector_deleted',
    targetType: 'dkim_selector',
    targetId: input.selectorId,
    metadata: { domainId: input.domainId },
  });
  return { deleted: true as const };
}

/**
 * Rotate the DKIM key for a domain: create a new active selector and mark the
 * previous active selector retired. The retired selector stays in the table (and
 * therefore resolvable) for 7 days; a cleanup job removes it afterward (R1.5).
 */
export async function rotateDkimSelector(input: {
  domainId: string;
  newSelector?: string;
  keySource?: KeySource;
  billionmailPublicKey?: string;
  actor: string;
  actorId?: string | null;
}): Promise<{ active: DkimSelectorRecord; retired: DkimSelectorRecord[]; txt: DkimTxtRecord; resolvableUntil: string }> {
  const db = store();
  const previousActive = (await fetchSelectorRows(input.domainId)).filter((row) => row.status === 'active');

  // Pick a fresh default selector that does not collide with the current one.
  let selector = input.newSelector?.toLowerCase() ?? defaultSelectorName();
  if (previousActive.some((row) => row.selector === selector)) {
    selector = `${defaultSelectorName()}-${Date.now().toString(36)}`;
  }

  const created = await createDkimSelector({
    domainId: input.domainId,
    selector,
    keySource: input.keySource,
    billionmailPublicKey: input.billionmailPublicKey,
    actor: input.actor,
    actorId: input.actorId,
  });

  const retiredAt = new Date().toISOString();
  const resolvableUntil = new Date(Date.now() + RETIRED_RESOLVABLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const retired: DkimSelectorRecord[] = [];
  for (const row of previousActive) {
    const { data, error } = await db
      .from('dkim_selectors')
      .update({ status: 'retired', retired_at: retiredAt })
      .eq('id', row.id)
      .select('id,domain_id,selector,public_key,encrypted_private_key,credential_key_version,key_source,status,retired_at,created_at')
      .maybeSingle();
    if (error) throw new Error(supabaseErrorMessage(error));
    if (data) retired.push(toRecord(data as SelectorRow));
  }

  await writeAuditLog({
    actorId: input.actorId ?? input.actor,
    action: 'logimail.dkim_selector_rotated',
    targetType: 'dkim_selector',
    targetId: created.record.id,
    metadata: { domainId: input.domainId, newSelector: selector, retired: retired.map((r) => r.selector), resolvableUntil },
  });

  return { active: created.record, retired, txt: created.txt, resolvableUntil };
}

/** Decrypt a selector's private key (logimail-managed only) for signing/export. */
export async function getSelectorPrivateKey(domainId: string, selectorId: string): Promise<string | null> {
  const rows = await fetchSelectorRows(domainId);
  const row = rows.find((item) => item.id === selectorId);
  if (!row || !row.encrypted_private_key) return null;
  return decryptMailboxCredential(row.encrypted_private_key);
}

export function dkimError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'dkim_error');
  if (message === 'dkim_not_configured') return { status: 503, text: 'Thiếu service role cho DKIM.' };
  if (message === 'missing_credential_encryption_key') return { status: 503, text: 'Chưa cấu hình khóa mã hóa credential.' };
  if (message === 'domain_not_found') return { status: 404, text: 'Không tìm thấy domain.' };
  if (message === 'dkim_selector_conflict') return { status: 409, text: 'Selector đã tồn tại cho domain này.' };
  if (message === 'invalid_selector') return { status: 400, text: 'Selector không hợp lệ (1–63 ký tự, a-z0-9-).' };
  if (message === 'missing_billionmail_public_key') return { status: 400, text: 'Thiếu public key do BillionMail quản lý.' };
  return { status: 502, text: message };
}
