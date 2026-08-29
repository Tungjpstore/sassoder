import assert from 'node:assert/strict';
import test from 'node:test';

process.env.LOGIMAIL_SSO_SECRET = 'test-sso-secret-that-is-long-enough-123456';
const sso = await import('./sso-handoff.ts');

test('signed browser state carries a PKCE challenge and rejects tampering', () => {
  const now = 1_700_000_000;
  const state = sso.createSsoBrowserState({
    sourceHost: 'mail.logivn.com',
    targetHost: 'domain.logivn.com',
    target: 'domain',
    nextPath: '/domains?tab=dns',
    now: now * 1000,
  });

  const verified = sso.verifySsoBrowserState(state.value, {
    targetHost: 'domain.logivn.com',
    now: now * 1000,
  });
  assert.equal(verified.sourceHost, 'mail.logivn.com');
  assert.equal(verified.targetHost, 'domain.logivn.com');
  assert.equal(verified.next, '/domains?tab=dns');
  assert.match(verified.codeChallenge, /^[A-Za-z0-9_-]{43}$/);
  assert.throws(() => sso.verifySsoBrowserState(`${state.value}x`, { targetHost: 'domain.logivn.com', now: now * 1000 }));
  assert.throws(() => sso.verifySsoBrowserState(state.value, { targetHost: 'mail.logivn.com', now: now * 1000 }), /target_mismatch/);
});

test('browser state expires and tickets are one-minute artifacts', () => {
  const now = 1_700_000_000;
  const state = sso.createSsoBrowserState({
    sourceHost: 'mail.logivn.com',
    targetHost: 'domain.logivn.com',
    target: 'domain',
    nextPath: '/dashboard',
    now: now * 1000,
  });
  assert.throws(
    () => sso.verifySsoBrowserState(state.value, { targetHost: 'domain.logivn.com', now: (now + 91) * 1000 }),
    /expired_sso_state/,
  );

  const ticket = sso.createSsoHandoffTicket({
    sourceHost: 'mail.logivn.com',
    targetHost: 'domain.logivn.com',
    now: now * 1000,
  });
  const verified = sso.verifySsoHandoffTicket(ticket.ticket, {
    targetHost: 'domain.logivn.com',
    now: now * 1000,
  });
  assert.equal(verified.id, ticket.id);
  assert.equal(verified.nonceHash, ticket.nonceHash);
  assert.throws(
    () => sso.verifySsoHandoffTicket(ticket.ticket, { targetHost: 'domain.logivn.com', now: (now + 61) * 1000 }),
    /expired_sso_ticket/,
  );
});

test('production next paths stay within the selected surface', () => {
  assert.equal(sso.safeSsoNextPath('mail', '/domains'), '/mail/inbox');
  assert.equal(sso.safeSsoNextPath('domain', '/mail/inbox'), '/');
  assert.equal(sso.safeSsoNextPath('domain', 'https://evil.example/'), '/');
  assert.equal(sso.safeSsoNextPath('mail', '/mail/inbox?tab=work'), '/mail/inbox?tab=work');
  assert.equal(sso.safeSsoNextPath('mail', '/mail/inbox?access_token=secret'), '/mail/inbox');
  assert.equal(sso.safeSsoNextPath('domain', '/domains?email=person@example.com'), '/');
  assert.equal(
    sso.safeSsoNextPath('mail', '/mail/inbox?next=%2Fmail%2Finbox%3Faccess_token%3Dsecret'),
    '/mail/inbox',
  );
});

test('request context trusts the public Host before an internal forwarded host', () => {
  const request = new Request('http://127.0.0.1:3000/api/logimail/auth/sso/start', {
    method: 'POST',
    headers: {
      host: 'mail.logivn.com',
      origin: 'https://mail.logivn.com',
      'x-forwarded-host': '127.0.0.1:3000',
      'x-forwarded-proto': 'https',
    },
  });

  assert.deepEqual(sso.trustedSsoRequestContext(request), {
    hostname: 'mail.logivn.com',
    origin: 'https://mail.logivn.com',
    local: false,
  });
});

test('request context rejects cross-host and external origins', () => {
  const crossHost = new Request('https://domain.logivn.com/api/logimail/auth/sso/start', {
    method: 'POST',
    headers: {
      host: 'domain.logivn.com',
      origin: 'https://mail.logivn.com',
    },
  });
  const external = new Request('https://mail.logivn.com/api/logimail/auth/sso/start', {
    method: 'POST',
    headers: {
      host: 'mail.logivn.com',
      origin: 'https://attacker.example',
    },
  });
  const conflictingProxyHost = new Request('https://domain.logivn.com/api/logimail/auth/sso/start', {
    method: 'POST',
    headers: {
      host: 'domain.logivn.com',
      origin: 'https://mail.logivn.com',
      'x-forwarded-host': 'mail.logivn.com',
    },
  });

  assert.throws(() => sso.trustedSsoRequestContext(crossHost), /invalid_sso_origin/);
  assert.throws(() => sso.trustedSsoRequestContext(external), /invalid_sso_origin/);
  assert.throws(() => sso.trustedSsoRequestContext(conflictingProxyHost), /invalid_sso_origin/);
});

test('request context preserves an exact localhost origin in development', () => {
  const request = new Request('http://localhost:3100/api/logimail/auth/sso/start', {
    method: 'POST',
    headers: {
      host: 'localhost:3100',
      origin: 'http://localhost:3100',
    },
  });

  assert.deepEqual(sso.trustedSsoRequestContext(request), {
    hostname: 'localhost',
    origin: 'http://localhost:3100',
    local: true,
  });

  const ipv6Request = new Request('http://[::1]:3100/api/logimail/auth/sso/start', {
    method: 'POST',
    headers: {
      host: '[::1]:3100',
      origin: 'http://[::1]:3100',
    },
  });
  assert.deepEqual(sso.trustedSsoRequestContext(ipv6Request), {
    hostname: '::1',
    origin: 'http://[::1]:3100',
    local: true,
  });
});
