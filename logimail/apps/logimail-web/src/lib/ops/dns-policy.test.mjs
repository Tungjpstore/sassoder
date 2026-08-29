import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

const { inspectDkimPublicKey, inspectDnsPolicy, hasBlockingDnsFindings } = await import('./dns-policy.ts');

function publicKey(bits) {
  const { publicKey: key } = generateKeyPairSync('rsa', { modulusLength: bits });
  return key.export({ type: 'spki', format: 'der' }).toString('base64');
}

test('SPF duplicates are blocking and preserve Cloudflare record ids', () => {
  const findings = inspectDnsPolicy('example.com', [
    { id: 'spf-a', type: 'TXT', name: 'example.com', content: 'v=spf1 mx -all' },
    { id: 'spf-b', type: 'TXT', name: 'example.com', content: 'v=spf1 include:legacy.example ~all' },
  ]);
  const duplicate = findings.find((finding) => finding.code === 'spf_multiple_records');
  assert.deepEqual(duplicate?.recordIds, ['spf-a', 'spf-b']);
  assert.equal(hasBlockingDnsFindings(findings), true);
});

test('DKIM rejects weak RSA keys and accepts RSA-2048', () => {
  assert.deepEqual(inspectDkimPublicKey(publicKey(1024)), { valid: true, algorithm: 'rsa', bits: 1024 });
  assert.deepEqual(inspectDkimPublicKey(publicKey(2048)), { valid: true, algorithm: 'rsa', bits: 2048 });

  const findings = inspectDnsPolicy('example.com', [
    { id: 'weak-key', type: 'TXT', name: 'mail._domainkey.example.com', content: `v=DKIM1; k=rsa; p=${publicKey(1024)}` },
  ]);
  assert.equal(findings.some((finding) => finding.code === 'dkim_key_weak'), true);
});

test('complete authentication policy has no blockers', () => {
  const findings = inspectDnsPolicy('example.com', [
    { type: 'TXT', name: 'example.com', content: 'v=spf1 mx -all' },
    { type: 'TXT', name: '_dmarc.example.com', content: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com' },
    { type: 'TXT', name: 'mail._domainkey.example.com', content: `v=DKIM1; k=rsa; p=${publicKey(2048)}` },
    { type: 'TXT', name: '_mta-sts.example.com', content: 'v=STSv1; id=logimail-v1' },
    { type: 'TXT', name: '_smtp._tls.example.com', content: 'v=TLSRPTv1; rua=mailto:tlsrpt@example.com' },
  ]);
  assert.equal(hasBlockingDnsFindings(findings), false);
});
