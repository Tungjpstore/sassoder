import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';

const CREDENTIAL_VERSION = 'v1';

function credentialSecret() {
  return process.env.LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY?.trim() || '';
}

function credentialKey() {
  const secret = credentialSecret();
  if (secret.length < 24) return null;
  return createHash('sha256').update(`logimail-mailbox-credentials:${secret}`).digest();
}

export function mailCredentialReadiness() {
  const ready = Boolean(credentialKey());
  return {
    ready,
    missing: ready ? [] : ['LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY'],
  };
}

export function encryptMailboxCredential(value: string) {
  const key = credentialKey();
  if (!key) throw new Error('missing_credential_encryption_key');

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [CREDENTIAL_VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptMailboxCredential(value: string | null | undefined) {
  const key = credentialKey();
  if (!key || !value) return null;

  try {
    const [version, ivText, tagText, encryptedText] = value.split('.');
    if (version !== CREDENTIAL_VERSION || !ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function saveMailboxCredentials(input: { mailboxId: string; email: string; password: string }) {
  const readiness = mailCredentialReadiness();
  if (!readiness.ready) return { stored: false as const, reason: 'missing_credential_encryption_key' };

  const store = createLogimailServiceStore();
  if (!store) return { stored: false as const, reason: 'missing_service_store' };

  const encryptedUsername = encryptMailboxCredential(input.email.toLowerCase());
  const encryptedPassword = encryptMailboxCredential(input.password);
  const { error } = await store
    .from('mailboxes')
    .update({
      encrypted_imap_username: encryptedUsername,
      encrypted_imap_password: encryptedPassword,
      encrypted_smtp_username: encryptedUsername,
      encrypted_smtp_password: encryptedPassword,
    })
    .eq('id', input.mailboxId);

  if (error) throw new Error(supabaseErrorMessage(error));
  return { stored: true as const };
}
