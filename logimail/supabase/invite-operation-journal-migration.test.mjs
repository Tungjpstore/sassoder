import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('./migrations/20260723103000_logimail_invite_operation_journal.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const rls = readFileSync(new URL('./rls-policies.sql', import.meta.url), 'utf8');

test('invite operation journal records durable attempts and lease ownership', () => {
  assert.match(migration, /create table if not exists logimail\.workspace_invite_operations/);
  assert.match(migration, /attempt_id uuid primary key/);
  assert.match(migration, /lease_token uuid/);
  assert.match(migration, /lease_version integer not null/);
  assert.match(migration, /lease_expires_at timestamptz/);
  assert.match(migration, /previous_password_ciphertext text/);
  assert.match(migration, /alter table logimail\.workspace_invite_operations enable row level security/);
  assert.match(migration, /revoke all on table logimail\.workspace_invite_operations from anon, authenticated/);
  assert.match(schema, /create table if not exists logimail\.workspace_invite_operations/);
  assert.match(schema, /credential_key_version integer/);
  assert.match(rls, /alter table logimail\.workspace_invite_operations enable row level security/);
});

test('legacy processing invites fail closed instead of being timeout-reclaimed', () => {
  assert.match(migration, /'manual_review'/);
  assert.match(migration, /'legacy_processing_without_journal'/);
  assert.match(migration, /where wi\.status = 'processing'/);
  assert.doesNotMatch(migration, /update logimail\.workspace_invites[\s\S]*set status = 'active'[\s\S]*processing_at < /i);
});

test('claim and stage changes use exact identity plus lease CAS', () => {
  assert.match(migration, /create or replace function logimail\.claim_workspace_invite_operation/);
  assert.match(migration, /wi0\.token_hash = target_token_hash/);
  assert.match(migration, /wi0\.target_email = lower\(requested_email\)/);
  assert.match(migration, /lease_expires_at is null or lease_expires_at < now\(\)/);
  assert.match(migration, /create or replace function logimail\.touch_workspace_invite_operation/);
  assert.match(migration, /lease_token = target_lease_token/);
  assert.match(migration, /lease_version = expected_lease_version/);
});

test('final commit atomically provisions access, stores credentials, revokes sessions and accepts invite', () => {
  const start = migration.indexOf('create or replace function logimail.commit_workspace_invite_operation');
  const end = migration.indexOf('create or replace function logimail.abort_workspace_invite_operation', start);
  assert.ok(start >= 0 && end > start);
  const commit = migration.slice(start, end);

  assert.match(commit, /insert into logimail\.profiles/);
  assert.match(commit, /insert into logimail\.workspace_members/);
  assert.match(commit, /insert into logimail\.mailbox_permissions/);
  assert.match(commit, /encrypted_imap_password = new_encrypted_password/);
  assert.match(commit, /session_version = session_version \+ 1/);
  assert.match(commit, /status = 'accepted'/);
  assert.match(commit, /stage = 'completed'/);
});

test('abort and recovery release require the current lease owner', () => {
  assert.match(migration, /create or replace function logimail\.abort_workspace_invite_operation/);
  assert.match(migration, /create or replace function logimail\.require_workspace_invite_recovery/);
  assert.match(migration, /target_lease_token/);
  assert.match(migration, /expected_lease_version/);
  assert.match(migration, /grant execute on function logimail\.claim_workspace_invite_operation/);
  assert.match(migration, /grant execute on function logimail\.commit_workspace_invite_operation/);
});
