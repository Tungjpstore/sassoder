import assert from 'node:assert/strict';
import test from 'node:test';

const { safeNextPath } = await import('./safe-next-path.ts');

test('keeps same-origin relative destinations and preserves their query/hash', () => {
  assert.equal(safeNextPath('/mail/inbox?label=work#latest'), '/mail/inbox?label=work#latest');
  assert.equal(
    safeNextPath('/mail/inbox?return=https%3A%2F%2Fdocs.example%2Fstart'),
    '/mail/inbox?return=https%3A%2F%2Fdocs.example%2Fstart',
  );
  assert.equal(safeNextPath('/dashboard/domains'), '/dashboard/domains');
});

test('rejects absolute, protocol-relative, and URL-parser backslash redirects', () => {
  for (const value of [
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example/',
    '/foo/\\evil.example/',
  ]) {
    assert.equal(safeNextPath(value), '/mail/inbox', value);
  }
});

test('rejects encoded slash and backslash bypasses, including nested percent encoding', () => {
  for (const value of [
    '/%2f%2fevil.example/',
    '/%5cevil.example/',
    '/%252f%252fevil.example/',
    '/%2525255cevil.example/',
    '/%09/evil.example/',
  ]) {
    assert.equal(safeNextPath(value), '/mail/inbox', value);
  }
});

test('auth forms and callback can opt out of auth-route destinations', () => {
  assert.equal(safeNextPath('/auth/login', { disallowAuthRoutes: true }), '/mail/inbox');
  assert.equal(safeNextPath('/authentic', { disallowAuthRoutes: true }), '/authentic');
  assert.equal(safeNextPath('/auth/invite', { disallowAuthRoutes: false }), '/auth/invite');
});

test('malformed percent escapes fail closed', () => {
  assert.equal(safeNextPath('/mail/%'), '/mail/inbox');
  assert.equal(safeNextPath('/mail/inbox?value=%'), '/mail/inbox?value=%');
});
