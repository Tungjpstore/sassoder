import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Configure key material BEFORE importing the module under test so that
// version-specific KEKs are available. Base key backs v1 + any unconfigured
// version; explicit per-version overrides exercise multi-key rotation paths.
process.env.LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY = 'base-secret-key-for-logimail-envelope-tests-0001';
process.env.LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY_V2 = 'second-version-secret-key-for-logimail-tests-002';
process.env.LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY_V3 = 'third-version-secret-key-for-logimail-tests-0003';

const {
  encryptMailboxCredential,
  decryptMailboxCredential,
  credentialCipherVersion,
  mailCredentialReadiness,
} = await import('./envelope-crypto.ts');

const VERSIONS = [1, 2, 3];

function randomPlaintext() {
  const styles = [
    () => randomBytes(1 + Math.floor(Math.random() * 64)).toString('base64url'),
    () => randomBytes(1 + Math.floor(Math.random() * 48)).toString('hex'),
    () => `pä$$wörd-${randomBytes(8).toString('hex')}-✓🔐-${Math.random()}`,
    () => '', // empty string edge case
    () => 'a'.repeat(1 + Math.floor(Math.random() * 256)),
  ];
  return styles[Math.floor(Math.random() * styles.length)]();
}

test('readiness reports ready when the base key is configured', () => {
  assert.equal(mailCredentialReadiness().ready, true);
});

// Property 2 / R13.3: decrypt(encrypt(c)) === c across every key version, for
// randomized inputs, and the ciphertext never leaks the plaintext.
test('round-trips across key versions and never leaks plaintext (Property 2 / R13.3)', () => {
  for (let i = 0; i < 500; i += 1) {
    const version = VERSIONS[i % VERSIONS.length];
    const plaintext = randomPlaintext();

    const ciphertext = encryptMailboxCredential(plaintext, version);

    // Round-trip fidelity.
    assert.equal(decryptMailboxCredential(ciphertext), plaintext, `round-trip failed for v${version}: ${JSON.stringify(plaintext)}`);

    // Ciphertext is tagged with the version it was encrypted under.
    assert.equal(credentialCipherVersion(ciphertext), version);

    // Confidentiality: a non-trivial plaintext must not appear verbatim in the ciphertext.
    if (plaintext.length >= 4) {
      assert.ok(!ciphertext.includes(plaintext), `ciphertext leaked plaintext for v${version}`);
      const b64 = Buffer.from(plaintext, 'utf8').toString('base64url');
      if (b64.length >= 6) {
        assert.ok(!ciphertext.includes(b64), `ciphertext leaked base64 plaintext for v${version}`);
      }
    }
  }
});

test('encrypting the same value twice yields different ciphertext (random DEK/IV)', () => {
  const plaintext = 'deterministic-input-should-still-randomize';
  const a = encryptMailboxCredential(plaintext, 1);
  const b = encryptMailboxCredential(plaintext, 1);
  assert.notEqual(a, b);
  assert.equal(decryptMailboxCredential(a), plaintext);
  assert.equal(decryptMailboxCredential(b), plaintext);
});

test('tampered ciphertext fails closed (returns null, no throw)', () => {
  const ciphertext = encryptMailboxCredential('secret-value-123', 2);
  const parts = ciphertext.split('.');
  // Flip a byte in the encrypted data segment.
  const tampered = Buffer.from(parts[6], 'base64url');
  tampered[0] ^= 0xff;
  parts[6] = tampered.toString('base64url');
  assert.equal(decryptMailboxCredential(parts.join('.')), null);
});

test('garbage / unknown formats decrypt to null', () => {
  assert.equal(decryptMailboxCredential(null), null);
  assert.equal(decryptMailboxCredential(undefined), null);
  assert.equal(decryptMailboxCredential(''), null);
  assert.equal(decryptMailboxCredential('not-a-cipher'), null);
  assert.equal(decryptMailboxCredential('k9.aaa.bbb'), null);
});
