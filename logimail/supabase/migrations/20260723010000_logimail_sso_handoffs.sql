-- Short-lived, one-time SSO handoffs between LogiMail's two first-party hosts.
-- Supabase auth cookies remain host-only; raw tickets, state and PKCE verifiers
-- are never persisted.
create table if not exists logimail.sso_handoffs (
  id uuid primary key,
  nonce_hash text not null unique check (nonce_hash ~ '^[0-9a-f]{64}$'),
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_host text not null check (source_host = lower(source_host) and source_host !~ '[/:]'),
  target_host text not null check (target_host = lower(target_host) and target_host !~ '[/:]'),
  target_path text not null check (target_path like '/%' and target_path not like '//%'),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  status text not null default 'active' check (status in ('active', 'consumed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sso_handoffs_consumed_check check (
    (status = 'consumed' and consumed_at is not null)
    or (status <> 'consumed' and consumed_at is null)
  )
);

create index if not exists sso_handoffs_active_expiry_idx
  on logimail.sso_handoffs (status, expires_at);
create index if not exists sso_handoffs_user_status_idx
  on logimail.sso_handoffs (user_id, status, expires_at desc);

alter table logimail.sso_handoffs enable row level security;
revoke all on table logimail.sso_handoffs from public, anon, authenticated;
grant select, insert, update, delete on table logimail.sso_handoffs to service_role;

create or replace function logimail.consume_sso_handoff(
  target_handoff_id uuid,
  target_nonce_hash text,
  target_state_hash text,
  expected_target_host text,
  expected_code_challenge text
)
returns table (
  user_id uuid,
  source_host text,
  target_host text,
  target_path text
)
language sql
security definer
set search_path = pg_catalog, logimail
as $$
  update logimail.sso_handoffs as handoff
     set status = 'consumed',
         consumed_at = now()
   where handoff.id = target_handoff_id
     and handoff.nonce_hash = target_nonce_hash
     and handoff.state_hash = target_state_hash
     and handoff.target_host = expected_target_host
     and handoff.code_challenge = expected_code_challenge
     and handoff.status = 'active'
     and handoff.expires_at > now()
  returning handoff.user_id, handoff.source_host, handoff.target_host, handoff.target_path;
$$;

revoke all on function logimail.consume_sso_handoff(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function logimail.consume_sso_handoff(uuid, text, text, text, text) to service_role;

create or replace function logimail.revoke_sso_handoffs(target_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, logimail
as $$
declare
  affected bigint;
begin
  update logimail.sso_handoffs
     set status = 'revoked'
   where user_id = target_user_id
     and status = 'active';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function logimail.revoke_sso_handoffs(uuid) from public, anon, authenticated;
grant execute on function logimail.revoke_sso_handoffs(uuid) to service_role;

comment on table logimail.sso_handoffs is
  'One-time SSO CAS records. Raw ticket nonce, browser state and PKCE verifier are never stored.';
