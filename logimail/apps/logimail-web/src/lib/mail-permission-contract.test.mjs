import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const permission = readFileSync(new URL('./mail-permission.ts', import.meta.url), 'utf8');
const mailAccess = readFileSync(new URL('./mail-access.ts', import.meta.url), 'utf8');
const dataLoader = readFileSync(new URL('./logimail-data.ts', import.meta.url), 'utf8');
const { resolveMailboxPermission } = await import('./mail-permission.ts');

test('own mailbox permission resolution is explicit and elevates stale read grants', () => {
  assert.match(permission, /export function resolveMailboxPermission/);
  assert.match(permission, /mailboxEmail.*toLowerCase\(\)/);
  assert.match(permission, /mailboxEmail === userEmail/);
  assert.match(permission, /return 'admin'/);
  assert.match(permission, /(?:input\.)?permission === 'admin' \|\| (?:input\.)?permission === 'send' \|\| (?:input\.)?permission === 'read'/);

  assert.equal(resolveMailboxPermission({
    mailboxEmail: '  Owner@Example.com ',
    userEmail: 'owner@example.com',
    permission: 'read',
    fallback: 'member',
  }), 'admin');
  assert.equal(resolveMailboxPermission({
    mailboxEmail: 'shared@example.com',
    userEmail: 'owner@example.com',
    permission: 'read',
    fallback: 'member',
  }), 'read');
  assert.equal(resolveMailboxPermission({
    mailboxEmail: 'shared@example.com',
    userEmail: 'owner@example.com',
    fallback: 'member',
  }), 'member');
});

test('API and Server Component loaders share the own-mailbox elevation rule', () => {
  assert.match(mailAccess, /resolveMailboxPermission\(/);
  assert.match(dataLoader, /resolveMailboxPermission\(/);
});
