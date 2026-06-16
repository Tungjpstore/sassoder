import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('./migrations/20260613120000_logimail_deliverability_multidomain.sql', import.meta.url),
  'utf8',
);

const newTables = [
  'encryption_keys',
  'dkim_selectors',
  'domain_quotas',
  'warmup_plans',
  'suppression_list',
  'alerts',
  'runbook_runs',
  'seed_placement_tests',
];

test('every created table lives in the logimail schema (Req 21.1)', () => {
  const creates = migration.match(/create table[^;]*?\b(\w+)\.(\w+)\s*\(/gi) ?? [];
  assert.ok(creates.length > 0, 'migration must create at least one table');
  for (const stmt of creates) {
    assert.match(stmt, /create table (if not exists )?logimail\./i, `table must be in logimail schema: ${stmt}`);
  }
});

test('migration does not touch the public schema', () => {
  assert.doesNotMatch(migration, /\bpublic\.\w+/, 'migration must not reference the public schema');
});

test('all new deliverability/multidomain tables are present', () => {
  for (const table of newTables) {
    assert.match(migration, new RegExp(`create table if not exists logimail\\.${table}\\b`), `missing table ${table}`);
  }
});

test('domains is extended with Sending_Domain columns (Req 18, 20, 3)', () => {
  for (const col of ['parent_domain_id', 'stream_type', 'bimi_status', 'mta_sts_status', 'sending_ip']) {
    assert.match(migration, new RegExp(`add column if not exists ${col}\\b`), `domains missing column ${col}`);
  }
});

test('mailboxes gains credential_key_version (Req 13, 14)', () => {
  assert.match(migration, /alter table logimail\.mailboxes[\s\S]*credential_key_version/);
});

test('bounce_events dedupe unique index exists (Req 5.2)', () => {
  assert.match(migration, /create unique index if not exists bounce_events_provider_msg_uidx/);
});

test('audit_logs immutability rules block update and delete (Req 17.2)', () => {
  assert.match(migration, /on update to logimail\.audit_logs do instead nothing/i);
  assert.match(migration, /on delete to logimail\.audit_logs do instead nothing/i);
});

test('RLS is enabled for every new table', () => {
  for (const table of newTables) {
    assert.match(migration, new RegExp(`alter table logimail\\.${table} enable row level security`), `RLS not enabled for ${table}`);
  }
});

test('dkim_selectors private key is not exposed to authenticated role', () => {
  // service_role grant present, but no authenticated select grant for dkim_selectors
  assert.match(migration, /grant select, insert, update, delete on[\s\S]*logimail\.dkim_selectors/);
  const authGrant = migration.match(/grant select on([\s\S]*?)to authenticated;/);
  assert.ok(authGrant, 'authenticated select grant block must exist');
  assert.doesNotMatch(authGrant[1], /dkim_selectors/, 'dkim_selectors must not be readable by authenticated role');
});
