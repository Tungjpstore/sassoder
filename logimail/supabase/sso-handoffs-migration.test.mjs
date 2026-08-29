import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('./migrations/20260723010000_logimail_sso_handoffs.sql', import.meta.url), 'utf8');
const snapshot = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const policies = readFileSync(new URL('./rls-policies.sql', import.meta.url), 'utf8');

test('SSO handoff storage is hash-only, short-lived, and one-time', () => {
  assert.match(migration, /create table if not exists logimail\.sso_handoffs/);
  assert.match(migration, /nonce_hash text not null unique/);
  assert.match(migration, /state_hash text not null unique/);
  assert.match(migration, /code_challenge text not null/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /expires_at > now\(\)/);
  assert.match(migration, /set status = 'consumed/);
  assert.match(migration, /revoke_sso_handoffs/);
  assert.doesNotMatch(migration, /access_token|refresh_token|verifier\s+text|ticket\s+text/);
});

test('browser roles cannot read or execute SSO handoff records', () => {
  assert.match(migration, /revoke all on table logimail\.sso_handoffs from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table logimail\.sso_handoffs to service_role/);
  assert.match(migration, /revoke all on function logimail\.consume_sso_handoff/);
  assert.match(migration, /grant execute on function logimail\.consume_sso_handoff[^;]*to service_role/);
  assert.match(policies, /sso_handoffs/);
  assert.match(snapshot, /consume_sso_handoff/);
});
