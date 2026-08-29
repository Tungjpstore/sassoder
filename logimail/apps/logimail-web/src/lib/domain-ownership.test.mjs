import test from 'node:test';
import assert from 'node:assert/strict';

const { createDomainOwnershipChallenge, ownershipTokenMatches } = await import('./domain-ownership.ts');

test('ownership challenge uses a domain-scoped TXT record', () => {
  const challenge = createDomainOwnershipChallenge('Example.COM', new Date('2026-07-22T00:00:00.000Z'));
  assert.equal(challenge.name, '_logimail-challenge.example.com');
  assert.match(challenge.content, /^logimail-verification=[A-Za-z0-9_-]{32}$/);
  assert.equal(challenge.createdAt, '2026-07-22T00:00:00.000Z');
});

test('ownership verification requires an exact token match', () => {
  assert.equal(ownershipTokenMatches(['logimail-verification=secret'], 'secret'), true);
  assert.equal(ownershipTokenMatches(['prefix-logimail-verification=secret'], 'secret'), false);
  assert.equal(ownershipTokenMatches(['logimail-verification=other'], 'secret'), false);
});
