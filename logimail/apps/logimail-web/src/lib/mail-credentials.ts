import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import {
  activeCredentialKeyVersion,
  credentialCipherVersion,
  decryptMailboxCredential,
  encryptMailboxCredential,
  mailCredentialReadiness,
} from '@/lib/security/envelope-crypto';

// Envelope encryption (Requirement 13, 14):
//   - KEK (key-encryption key) derived from an env secret per key version.
//   - DEK (data-encryption key) generated per record, wrapped by the KEK.
//   - Ciphertext format (envelope): `k{version}.ivK.tagK.encDek.ivD.tagD.encData`
//   - Legacy format (v1, single static key): `v1.iv.tag.enc` — still decryptable
//     for backward compatibility until rotation re-encrypts it.
//
// The crypto primitives live in `./security/envelope-crypto` (a pure module with
// no project-alias / server-only imports) so they can be property-tested directly.
// This module re-exports them and adds the Supabase persistence layer.

export {
  activeCredentialKeyVersion,
  credentialCipherVersion,
  decryptMailboxCredential,
  encryptMailboxCredential,
  mailCredentialReadiness,
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function prepareMailboxCredentials(input: { email: string; password: string }) {
  const readiness = mailCredentialReadiness();
  if (!readiness.ready) return { prepared: false as const, reason: 'missing_credential_encryption_key' };

  const version = activeCredentialKeyVersion();
  const encryptedUsername = encryptMailboxCredential(input.email.toLowerCase(), version);
  const encryptedPassword = encryptMailboxCredential(input.password, version);
  return {
    prepared: true as const,
    credentialKeyVersion: version,
    encryptedUsername,
    encryptedPassword,
  };
}

export async function saveMailboxCredentials(input: { mailboxId: string; email: string; password: string }) {
  const prepared = prepareMailboxCredentials(input);
  if (!prepared.prepared) return { stored: false as const, reason: prepared.reason };

  const store = createLogimailServiceStore();
  if (!store) return { stored: false as const, reason: 'missing_service_store' };

  const { data, error } = await store
    .from('mailboxes')
    .update({
      encrypted_imap_username: prepared.encryptedUsername,
      encrypted_imap_password: prepared.encryptedPassword,
      encrypted_smtp_username: prepared.encryptedUsername,
      encrypted_smtp_password: prepared.encryptedPassword,
      credential_key_version: prepared.credentialKeyVersion,
    })
    .eq('id', input.mailboxId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) return { stored: false as const, reason: 'mailbox_not_found' };
  return { stored: true as const };
}
