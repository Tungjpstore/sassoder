import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('./migrations/20260723100000_logimail_auth_session_activity.sql', import.meta.url),
  'utf8',
);
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const rls = readFileSync(new URL('./rls-policies.sql', import.meta.url), 'utf8');

for (const [label, source] of [['migration', migration], ['schema snapshot', schema]]) {
  test(`${label} stores durable activity against an Auth session`, () => {
    assert.match(source, /create table if not exists logimail\.auth_session_activity\s*\(/i);
    assert.match(source, /session_id uuid primary key references auth\.sessions\s*\(id\) on delete cascade/i);
    assert.match(source, /user_id uuid not null references auth\.users\s*\(id\) on delete cascade/i);
    assert.match(source, /first_seen_at timestamptz not null default now\(\)/i);
    assert.match(source, /last_active_at timestamptz not null default now\(\)/i);
    assert.match(source, /alter table logimail\.auth_session_activity enable row level security/i);
    assert.match(source, /revoke all on logimail\.auth_session_activity from public, anon, authenticated/i);
  });

  test(`${label} atomically expires sessions idle for more than eight hours`, () => {
    const rpc = source.match(
      /create or replace function logimail\.touch_auth_session_activity\(target_session_id uuid, target_user_id uuid\)([\s\S]*?)\$\$;/i,
    );
    assert.ok(rpc, 'session activity RPC must be defined');
    assert.match(rpc[1], /security definer/i);
    assert.match(rpc[1], /set search_path = pg_catalog, auth, logimail/i);
    assert.match(rpc[1], /from auth\.sessions[\s\S]*for update/i);
    assert.match(rpc[1], /session_user_id is distinct from target_user_id/i);
    assert.match(rpc[1], /insert into logimail\.auth_session_activity/i);
    assert.match(rpc[1], /last_active_at < now\(\) - interval '8 hours'/i);
    assert.match(rpc[1], /delete from auth\.sessions/i);
    assert.match(rpc[1], /'idle_expired'/i);
    assert.match(rpc[1], /update logimail\.auth_session_activity[\s\S]*last_active_at = now\(\)/i);
  });

  test(`${label} exposes the activity RPC only to service_role`, () => {
    assert.match(
      source,
      /revoke all on function logimail\.touch_auth_session_activity\(uuid, uuid\) from public, anon, authenticated/i,
    );
    assert.match(
      source,
      /grant execute on function logimail\.touch_auth_session_activity\(uuid, uuid\) to service_role/i,
    );
    assert.doesNotMatch(
      source,
      /grant execute on function logimail\.touch_auth_session_activity\(uuid, uuid\) to (?:public|anon|authenticated)/i,
    );
  });
}

test('RLS snapshot keeps session activity server-only after blanket grants', () => {
  assert.match(rls, /alter table logimail\.auth_session_activity enable row level security/i);
  assert.match(rls, /revoke all on logimail\.auth_session_activity from public, anon, authenticated/i);
  assert.match(rls, /grant select, insert, update, delete on logimail\.auth_session_activity to service_role/i);
});
