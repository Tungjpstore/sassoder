-- Persistent auth abuse controls for login, signup, OTP resend and password recovery.
-- The app stores only HMAC/SHA-256 key hashes, never raw email or IP values.

create table if not exists public.auth_rate_limits (
  key_hash text primary key,
  scope text not null,
  attempts integer not null default 0,
  reset_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_rate_limits_key_hash_format check (key_hash ~ '^[a-f0-9]{64}$'),
  constraint auth_rate_limits_attempts_positive check (attempts >= 0)
);

create index if not exists auth_rate_limits_scope_reset_idx
  on public.auth_rate_limits (scope, reset_at);

alter table public.auth_rate_limits enable row level security;

revoke all on public.auth_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.auth_rate_limits to service_role;

create or replace function public.check_auth_rate_limit(
  p_key_hash text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_attempts integer;
begin
  if p_key_hash is null
    or p_key_hash !~ '^[a-f0-9]{64}$'
    or p_scope is null
    or length(trim(p_scope)) = 0
    or p_limit < 1
    or p_window_seconds < 1
  then
    return false;
  end if;

  delete from public.auth_rate_limits
  where reset_at < v_now - interval '1 day';

  insert into public.auth_rate_limits (key_hash, scope, attempts, reset_at, first_seen_at, updated_at)
  values (p_key_hash, left(p_scope, 80), 1, v_now + make_interval(secs => p_window_seconds), v_now, v_now)
  on conflict (key_hash) do update
    set scope = excluded.scope,
        attempts = case
          when public.auth_rate_limits.reset_at <= v_now then 1
          else public.auth_rate_limits.attempts + 1
        end,
        reset_at = case
          when public.auth_rate_limits.reset_at <= v_now then excluded.reset_at
          else public.auth_rate_limits.reset_at
        end,
        first_seen_at = case
          when public.auth_rate_limits.reset_at <= v_now then v_now
          else public.auth_rate_limits.first_seen_at
        end,
        updated_at = v_now
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.check_auth_rate_limit(text, text, integer, integer) from public;
grant execute on function public.check_auth_rate_limit(text, text, integer, integer) to service_role;
