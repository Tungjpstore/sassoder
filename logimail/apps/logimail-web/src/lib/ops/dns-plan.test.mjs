import test from 'node:test';
import assert from 'node:assert/strict';

const { diffDnsPlan, recordSlot, recordValueKey, enforceProxyPolicy, isMailTransportRecord, typedDnsChanges } = await import('./dns-plan.ts');

function applyDiff(existing, planned) {
  // Simulate Cloudflare applying a plan: add only toCreate records.
  const diff = diffDnsPlan(planned, existing);
  return { next: [...existing, ...diff.toCreate], diff };
}

test('mail transport records are never proxied (R12.4)', () => {
  assert.equal(enforceProxyPolicy({ type: 'A', name: 'mail.x.com', content: '1.2.3.4', proxied: true }).proxied, false);
  assert.equal(enforceProxyPolicy({ type: 'MX', name: 'x.com', content: 'mail.x.com', priority: 10, proxied: true }).proxied, false);
  assert.equal(isMailTransportRecord({ type: 'TXT', name: 'x.com', content: 'v=spf1' }), false);
});

test('content difference on same slot needs confirmation (R12.3)', () => {
  const existing = [{ id: 'spf-old', type: 'TXT', name: 'x.com', content: 'v=spf1 -all' }];
  const planned = [{ type: 'TXT', name: 'x.com', content: 'v=spf1 ip4:1.2.3.4 -all' }];
  const diff = diffDnsPlan(planned, existing);
  assert.equal(diff.toModify.length, 1);
  assert.equal(diff.toModify[0].existing.id, 'spf-old');
  assert.equal(diff.toCreate.length, 0);
});

test('SPF never overwrites unrelated TXT records at the domain apex', () => {
  const existing = [
    { id: 'google-site-verification', type: 'TXT', name: 'x.com', content: 'google-site-verification=abc123' },
  ];
  const planned = [{ type: 'TXT', name: 'x.com', content: 'v=spf1 mx -all' }];
  const diff = diffDnsPlan(planned, existing);

  assert.equal(diff.toCreate.length, 1);
  assert.equal(diff.toModify.length, 0);
  assert.equal(diff.duplicates.length, 0);
});

test('duplicate records in a planned slot are preserved and reported', () => {
  const existing = [
    { id: 'mx-primary', type: 'MX', name: 'x.com', content: 'mail.x.com', priority: 10 },
    { id: 'mx-legacy', type: 'MX', name: 'x.com', content: 'mail.legacy.com', priority: 10 },
  ];
  const planned = [{ type: 'MX', name: 'x.com', content: 'mail.x.com', priority: 10 }];
  const diff = diffDnsPlan(planned, existing);

  assert.equal(diff.alreadyApplied.length, 1);
  assert.deepEqual(diff.duplicates.map((record) => record.id), ['mx-legacy']);
  assert.equal(existing.length, 2);
});

test('exact duplicate values consume only one existing record', () => {
  const existing = [
    { id: 'spf-1', type: 'TXT', name: 'x.com', content: 'v=spf1 -all' },
    { id: 'spf-2', type: 'TXT', name: 'x.com', content: 'v=spf1 -all' },
  ];
  const planned = [{ type: 'TXT', name: 'x.com', content: 'v=spf1 -all' }];
  const diff = diffDnsPlan(planned, existing);

  assert.equal(diff.alreadyApplied.length, 1);
  assert.deepEqual(diff.duplicates.map((record) => record.id), ['spf-2']);
});

test('exact MTA-STS and TLS-RPT TXT records are creatable beside a wildcard CNAME', () => {
  const existing = [
    { id: 'wildcard', type: 'CNAME', name: '*.x.com', content: 'vercel.example.com' },
  ];
  const planned = [
    { type: 'TXT', name: '_mta-sts.x.com', content: 'v=STSv1; id=20260722' },
    { type: 'TXT', name: '_smtp._tls.x.com', content: 'v=TLSRPTv1; rua=mailto:tlsrpt@x.com' },
  ];
  const diff = diffDnsPlan(planned, existing);

  assert.equal(diff.toCreate.length, 2);
  assert.equal(diff.toModify.length, 0);
  assert.equal(diff.duplicates.length, 0);
});

function randomRecord() {
  const types = ['TXT', 'A', 'MX', 'CNAME'];
  const type = types[Math.floor(Math.random() * types.length)];
  const rec = {
    type,
    name: `host${Math.floor(Math.random() * 8)}.example.com`,
    content: `value-${Math.floor(Math.random() * 8)}`,
  };
  if (type === 'MX') rec.priority = [10, 20, 30][Math.floor(Math.random() * 3)];
  return rec;
}

// Property 4 (Validates Requirements 21.2, 21.4): applying a plan N>=2 times
// yields the same zone set as applying it once, and re-runs report nothing to
// create (already_applied).
test('⚠ property: DNS provisioning is idempotent across repeated applies', () => {
  for (let trial = 0; trial < 500; trial += 1) {
    // Start from a random pre-existing zone.
    let zone = Array.from({ length: Math.floor(Math.random() * 6) }, () => randomRecord());
    // De-dup the starting zone by value key (a real zone has unique records).
    const seen = new Set();
    zone = zone.filter((r) => {
      const key = recordValueKey(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // A plan that only creates (avoid modify by using fresh slots).
    const planned = Array.from({ length: 1 + Math.floor(Math.random() * 5) }, (_, i) => ({
      type: 'TXT',
      name: `plan${i}.example.com`,
      content: `planned-${i}`,
    }));

    // First apply.
    const first = applyDiff(zone, planned);
    const afterFirst = first.next;

    // Second apply on the resulting zone.
    const second = applyDiff(afterFirst, planned);
    const afterSecond = second.next;

    // Idempotent: zone unchanged after the second apply.
    assert.deepEqual(
      afterSecond.map(recordValueKey).sort(),
      afterFirst.map(recordValueKey).sort(),
      'zone changed on re-apply',
    );
    // Re-run created nothing and reported all planned as already-applied.
    assert.equal(second.diff.toCreate.length, 0);
    assert.equal(second.diff.alreadyApplied.length, planned.length);

    // Third apply for good measure (N>=2).
    const third = applyDiff(afterSecond, planned);
    assert.equal(third.diff.toCreate.length, 0);
  }
});

test('recordSlot distinguishes MX priority', () => {
  const a = { type: 'MX', name: 'x.com', content: 'mail.x.com', priority: 10 };
  const b = { type: 'MX', name: 'x.com', content: 'mail2.x.com', priority: 20 };
  assert.notEqual(recordSlot(a), recordSlot(b));
});

test('typed DNS diff discloses create, update, delete candidate and noop records', () => {
  const existing = [
    { id: 'spf-old', type: 'TXT', name: 'x.com', content: 'v=spf1 -all', ttl: 300 },
    { id: 'mx-current', type: 'MX', name: 'x.com', content: 'mail.x.com', priority: 10, ttl: 300 },
    { id: 'mx-extra', type: 'MX', name: 'x.com', content: 'legacy.x.com', priority: 10, ttl: 120 },
  ];
  const planned = [
    { type: 'TXT', name: 'x.com', content: 'v=spf1 mx -all' },
    { type: 'MX', name: 'x.com', content: 'mail.x.com', priority: 10 },
    { type: 'TXT', name: '_dmarc.x.com', content: 'v=DMARC1; p=none' },
  ];

  const changes = typedDnsChanges(diffDnsPlan(planned, existing));
  assert.deepEqual(changes.map((change) => change.action), ['create', 'update', 'delete', 'noop']);
  assert.equal(changes.find((change) => change.action === 'update').after.ttl, 300);
  assert.equal(changes.find((change) => change.action === 'delete').before.id, 'mx-extra');
  assert.equal(changes.find((change) => change.action === 'noop').after.id, 'mx-current');
});
