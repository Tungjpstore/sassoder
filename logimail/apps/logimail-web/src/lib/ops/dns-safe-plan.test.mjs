import test from 'node:test';
import assert from 'node:assert/strict';

const { buildSafeDnsPlan } = await import('../logimail-store.ts');

test('domain-owned mail hostname receives an unproxied A record', () => {
  const plan = buildSafeDnsPlan('example.com', '203.0.113.10', 'mail.example.com');
  assert.deepEqual(plan[0], { type: 'A', name: 'mail.example.com', content: '203.0.113.10', proxied: false });
  assert.equal(plan.some((record) => record.type === 'MX' && record.content === 'mail.example.com'), true);
});

test('shared mail hostname is referenced by MX but never written into the customer zone', () => {
  const plan = buildSafeDnsPlan('customer.example', '203.0.113.10', 'mail.logivn.com');
  assert.equal(plan.some((record) => record.type === 'A'), false);
  assert.equal(plan.some((record) => record.type === 'MX' && record.content === 'mail.logivn.com'), true);
});
