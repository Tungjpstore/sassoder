import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Pure envelope-encryption primitives for mailbox/DKIM credentials (Requirement 13, 14).
// No project-alias or server-only imports so this can be unit/property tested directly.
//
//   - KEK derived from an env secret per key version.
//   - DEK generated per record, wrapped by the KEK.
//   - Envelope ciphertext: `k{version}.ivK.tagK.encDek.ivD.tagD.encData`
//   - Legacy (pre-envelope) ciphertext: `v1.iv.tag.enc` — still decryptable.

const LEGACY_VERSION = 'v1';

export function activeCredentialKeyVersion() {
  const raw = Number(process.env.LOGIMAIL_CREDENTIAL_KEY_VERSION ?? '1');
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

function kekSecretForVersion(version: number) {
  const specific = process.env[`LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY_V${version}`]?.trim();
  if (specific) return specific;
  return process.env.LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY?.trim() || '';
}

function kekForVersion(version: number) {
  const secret = kekSecretForVersion(version);
  if (secret.length < 24) return null;
  return createHash('sha256').update(`logimail-kek:v${version}:${secret}`).digest();
}

function legacyKey() {
  const secret = process.env.LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY?.trim() || '';
  if (secret.length < 24) return null;
  return createHash('sha256').update(`logimail-mailbox-credentials:${secret}`).digest();
}

export function mailCredentialReadiness() {
  const ready = Boolean(kekForVersion(activeCredentialKeyVersion()));
  return { ready, missing: ready ? [] : ['LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY'] };
}

function b64(buffer: Buffer) {
  return buffer.toString('base64url');
}

export function encryptMailboxCredential(value: string, version = activeCredentialKeyVersion()) {
  const kek = kekForVersion(version);
  if (!kek) throw new Error('missing_credential_encryption_key');

  const dek = randomBytes(32);

  const ivK = randomBytes(12);
  const cipherK = createCipheriv('aes-256-gcm', kek, ivK);
  const encDek = Buffer.concat([cipherK.update(dek), cipherK.final()]);
  const tagK = cipherK.getAuthTag();

  const ivD = randomBytes(12);
  const cipherD = createCipheriv('aes-256-gcm', dek, ivD);
  const encData = Buffer.concat([cipherD.update(value, 'utf8'), cipherD.final()]);
  const tagD = cipherD.getAuthTag();

  return [`k${version}`, b64(ivK), b64(tagK), b64(encDek), b64(ivD), b64(tagD), b64(encData)].join('.');
}

function decryptEnvelope(value: string) {
  const parts = value.split('.');
  if (parts.length !== 7) return null;
  const match = /^k(\d+)$/.exec(parts[0]);
  if (!match) return null;
  const kek = kekForVersion(Number(match[1]));
  if (!kek) return null;

  const [, ivKText, tagKText, encDekText, ivDText, tagDText, encDataText] = parts;
  const decipherK = createDecipheriv('aes-256-gcm', kek, Buffer.from(ivKText, 'base64url'));
  decipherK.setAuthTag(Buffer.from(tagKText, 'base64url'));
  const dek = Buffer.concat([decipherK.update(Buffer.from(encDekText, 'base64url')), decipherK.final()]);

  const decipherD = createDecipheriv('aes-256-gcm', dek, Buffer.from(ivDText, 'base64url'));
  decipherD.setAuthTag(Buffer.from(tagDText, 'base64url'));
  return Buffer.concat([decipherD.update(Buffer.from(encDataText, 'base64url')), decipherD.final()]).toString('utf8');
}

function decryptLegacy(value: string) {
  const key = legacyKey();
  if (!key) return null;
  const [version, ivText, tagText, encryptedText] = value.split('.');
  if (version !== LEGACY_VERSION || !ivText || !tagText || !encryptedText) return null;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
}

export function decryptMailboxCredential(value: string | null | undefined) {
  if (!value) return null;
  try {
    if (value.startsWith('k')) return decryptEnvelope(value);
    if (value.startsWith(`${LEGACY_VERSION}.`)) return decryptLegacy(value);
    return null;
  } catch {
    return null;
  }
}

/** Key version a stored ciphertext was encrypted with (0 = legacy v1). */
export function credentialCipherVersion(value: string | null | undefined) {
  if (!value) return null;
  const match = /^k(\d+)\./.exec(value);
  if (match) return Number(match[1]);
  if (value.startsWith(`${LEGACY_VERSION}.`)) return 0;
  return null;
}
