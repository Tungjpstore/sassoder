import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import {
  activeCredentialKeyVersion,
  credentialCipherVersion,
  decryptMailboxCredential,
  encryptMailboxCredential,
  mailCredentialReadiness,
} from '@/lib/mail-credentials';

const CREDENTIAL_COLUMNS = [
  'encrypted_imap_username',
  'encrypted_imap_password',
  'encrypted_smtp_username',
  'encrypted_smtp_password',
] as const;

type MailboxCredentialRow = {
  id: string;
  credential_key_version: number | null;
  encrypted_imap_username: string | null;
  encrypted_imap_password: string | null;
  encrypted_smtp_username: string | null;
  encrypted_smtp_password: string | null;
};

export type KeyRotationResult = {
  newVersion: number;
  scanned: number;
  reencrypted: number;
  failed: number;
  remaining: number;
  errors: Array<{ mailboxId: string; reason: string }>;
};

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('key_rotation_not_configured');
  return client;
}

/** Mark the active version active and demote any older active versions to retiring (R14.1). */
async function syncKeyVersionRegistry(activeVersion: number) {
  const db = store();
  await db.from('encryption_keys').upsert({ version: activeVersion, status: 'active' }, { onConflict: 'version' });
  await db
    .from('encryption_keys')
    .update({ status: 'retiring' })
    .lt('version', activeVersion)
    .eq('status', 'active');
}

/**
 * Re-encrypt mailbox credentials to the active key version in batches.
 * Rows already on the active version are skipped. A row that fails to
 * re-encrypt keeps its prior ciphertext/version (R14.4). Records an audit
 * entry with the new key version and the count of re-encrypted credentials (R14.3).
 */
export async function rotateCredentialKeys(input: { actor: string; actorId?: string | null; batchSize?: number }): Promise<KeyRotationResult> {
  if (!mailCredentialReadiness().ready) throw new Error('missing_credential_encryption_key');

  const db = store();
  const activeVersion = activeCredentialKeyVersion();
  const batchSize = Math.min(500, Math.max(1, input.batchSize ?? 100));

  await syncKeyVersionRegistry(activeVersion);

  // Select rows that are not yet on the active version (null/legacy/older).
  const { data, error } = await db
    .from('mailboxes')
    .select('id,credential_key_version,encrypted_imap_username,encrypted_imap_password,encrypted_smtp_username,encrypted_smtp_password')
    .or(`credential_key_version.is.null,credential_key_version.neq.${activeVersion}`)
    .limit(batchSize + 1);
  if (error) throw new Error(supabaseErrorMessage(error));

  const rows = (data ?? []) as MailboxCredentialRow[];
  const batch = rows.slice(0, batchSize);
  const remaining = Math.max(0, rows.length - batch.length);

  const result: KeyRotationResult = {
    newVersion: activeVersion,
    scanned: batch.length,
    reencrypted: 0,
    failed: 0,
    remaining,
    errors: [],
  };

  for (const row of batch) {
    try {
      const update: Record<string, unknown> = { credential_key_version: activeVersion };
      let changed = false;

      for (const column of CREDENTIAL_COLUMNS) {
        const ciphertext = row[column];
        if (!ciphertext) continue;
        if (credentialCipherVersion(ciphertext) === activeVersion) continue;

        const plaintext = decryptMailboxCredential(ciphertext);
        if (plaintext === null) throw new Error(`decrypt_failed:${column}`);
        update[column] = encryptMailboxCredential(plaintext, activeVersion);
        changed = true;
      }

      if (!changed) {
        // Nothing to re-encrypt (e.g., all columns null) — just stamp the version.
        await db.from('mailboxes').update({ credential_key_version: activeVersion }).eq('id', row.id);
        continue;
      }

      const { error: updateError } = await db.from('mailboxes').update(update).eq('id', row.id);
      if (updateError) throw new Error(supabaseErrorMessage(updateError));
      result.reencrypted += 1;
    } catch (rowError) {
      // Keep prior key version for this row (R14.4).
      result.failed += 1;
      result.errors.push({ mailboxId: row.id, reason: rowError instanceof Error ? rowError.message : 'unknown' });
    }
  }

  await writeAuditLog({
    actorId: input.actorId ?? input.actor,
    action: 'logimail.credential_key_rotated',
    targetType: 'encryption_key',
    targetId: String(activeVersion),
    metadata: { newVersion: activeVersion, reencrypted: result.reencrypted, failed: result.failed, remaining: result.remaining },
  });

  return result;
}

export function keyRotationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'key_rotation_error');
  if (message === 'key_rotation_not_configured') return { status: 503, text: 'Thiếu service role cho key rotation.' };
  if (message === 'missing_credential_encryption_key') return { status: 503, text: 'Chưa cấu hình khóa mã hóa credential.' };
  return { status: 502, text: message };
}
