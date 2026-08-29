import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('./migrations/20260722120000_logimail_p0_security_hardening.sql', import.meta.url),
  'utf8',
);
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const securityCodesTable = schema.match(/create table if not exists logimail\.security_codes\s*\(([\s\S]*?)\n\);/i)?.[1] ?? '';

test('profiles platform_role is constrained to platform-scoped roles', () => {
  assert.match(
    migration,
    /alter table logimail\.profiles[\s\S]*?add column if not exists platform_role text not null default 'none'/i,
  );
  assert.match(
    migration,
    /add constraint profiles_platform_role_check\s+check \(platform_role in \('none', 'platform_admin', 'platform_owner'\)\)/i,
  );
  assert.match(migration, /raw_app_meta_data\s*->>\s*'platform_role'/i);
  assert.match(migration, /logimail\.platform_role_backfilled/i);
  const backfill = migration.match(/with promoted as \(([\s\S]*?)\)\s*insert into logimail\.audit_logs/i)?.[1] ?? '';
  assert.doesNotMatch(backfill, /workspace_members|p\.role\b/i);
});

test('active password reset codes require a normalized target in the requested domain', () => {
  assert.match(
    migration,
    /alter table logimail\.security_codes[\s\S]*?add column if not exists target_email text/i,
  );
  assert.match(
    migration,
    /add constraint security_codes_target_email_check\s+check \(target_email is null or target_email = lower\(target_email\)\)/i,
  );
  assert.match(
    migration,
    /where purpose = 'password_reset'[\s\S]*?and status = 'active'[\s\S]*?target_email is null/i,
    'legacy active domain-wide reset codes must be revoked before the constraint is added',
  );
  assert.match(
    migration,
    /add constraint security_codes_reset_target_required_check[\s\S]*?purpose <> 'password_reset'[\s\S]*?status <> 'active'[\s\S]*?domain is not null[\s\S]*?target_email is not null[\s\S]*?split_part\(target_email, '@', 2\) = domain/i,
  );
  assert.match(
    migration,
    /create index if not exists security_codes_reset_target_idx\s+on logimail\.security_codes \(domain, target_email, purpose, status, expires_at\)/i,
  );
});

test('mailbox session_version is positive and starts at one', () => {
  assert.match(
    migration,
    /alter table logimail\.mailboxes[\s\S]*?add column if not exists session_version integer not null default 1/i,
  );
  assert.match(
    migration,
    /add constraint mailboxes_session_version_check\s+check \(session_version > 0\)/i,
  );
});

test('session version bump RPC is a hardened security definer function', () => {
  const functionDefinition = migration.match(
    /create or replace function logimail\.bump_mailbox_session_version\(target_mailbox_id uuid\)([\s\S]*?)\$\$;/i,
  );

  assert.ok(functionDefinition, 'session version bump RPC must be defined');
  assert.match(functionDefinition[1], /returns integer/i);
  assert.match(functionDefinition[1], /language sql/i);
  assert.match(functionDefinition[1], /security definer/i);
  assert.match(functionDefinition[1], /set search_path = pg_catalog, logimail/i);
  assert.doesNotMatch(functionDefinition[1], /set search_path\s*=.*\bpublic\b/i);
  assert.match(functionDefinition[1], /update logimail\.mailboxes/i);
  assert.match(functionDefinition[1], /set session_version = session_version \+ 1/i);
  assert.match(functionDefinition[1], /where id = target_mailbox_id/i);
  assert.match(functionDefinition[1], /returning session_version/i);
});

test('session version bump RPC is executable only by service_role', () => {
  assert.match(
    migration,
    /revoke all on function logimail\.bump_mailbox_session_version\(uuid\) from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /grant execute on function logimail\.bump_mailbox_session_version\(uuid\) to service_role;/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function logimail\.bump_mailbox_session_version\(uuid\) to (?:public|anon|authenticated);/i,
  );
});

test('targeted session revoke is server-side and invalidates mailbox cookies', () => {
  const revoke = migration.match(/create or replace function logimail\.revoke_user_sessions\(target_user_id uuid, actor_user_id uuid\)([\s\S]*?)\$\$;/i);
  assert.ok(revoke, 'targeted revoke RPC must be defined');
  assert.match(revoke[1], /delete from auth\.sessions where user_id = target_user_id/i);
  assert.match(revoke[1], /update logimail\.mailboxes/i);
  assert.match(revoke[1], /session_version = m\.session_version \+ 1/i);
  assert.match(revoke[1], /insert into logimail\.audit_logs/i);
  assert.match(migration, /revoke all on function logimail\.revoke_user_sessions\(uuid, uuid\) from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function logimail\.revoke_user_sessions\(uuid, uuid\) to service_role;/i);
});

test('legacy schema snapshot mirrors all P0 database invariants', () => {
  assert.match(schema, /platform_role text not null default 'none' check \(platform_role in \('none', 'platform_admin', 'platform_owner'\)\)/i);
  assert.match(schema, /session_version integer not null default 1 check \(session_version > 0\)/i);
  assert.match(securityCodesTable, /constraint security_codes_reset_target_required_check[\s\S]*?split_part\(target_email, '@', 2\) = domain/i);
  assert.doesNotMatch(schema.match(/create table if not exists logimail\.account_requests\s*\(([\s\S]*?)\n\);/i)?.[1] ?? '', /security_codes_reset_target_required_check/i);
  assert.match(schema, /set search_path = pg_catalog, logimail/i);
  assert.match(schema, /grant execute on function logimail\.bump_mailbox_session_version\(uuid\) to service_role;/i);
  assert.match(schema, /create or replace function logimail\.revoke_user_sessions\(target_user_id uuid, actor_user_id uuid\)/i);
  assert.match(schema, /create or replace function logimail\.reserve_mailbox_send_rate\(target_mailbox_id uuid, threshold integer\)/i);
});
