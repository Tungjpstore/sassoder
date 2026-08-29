-- Enforce an eight-hour idle timeout at the server boundary. Existing sessions
-- are grandfathered on their first protected request after this migration.

create table if not exists logimail.auth_session_activity (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

alter table logimail.auth_session_activity enable row level security;

revoke all on logimail.auth_session_activity from public, anon, authenticated;
grant select, insert, update, delete on logimail.auth_session_activity to service_role;

create or replace function logimail.touch_auth_session_activity(target_session_id uuid, target_user_id uuid)
returns table (allowed boolean, status text, last_active_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, auth, logimail
as $$
declare
  session_user_id uuid;
  previous_last_active_at timestamptz;
begin
  if target_session_id is null or target_user_id is null then
    return query select false, 'revoked'::text, null::timestamptz;
    return;
  end if;

  select sessions.user_id
    into session_user_id
    from auth.sessions as sessions
   where sessions.id = target_session_id
   for update;

  if not found or session_user_id is distinct from target_user_id then
    return query select false, 'revoked'::text, null::timestamptz;
    return;
  end if;

  insert into logimail.auth_session_activity (session_id, user_id)
  values (target_session_id, target_user_id)
  on conflict (session_id) do nothing;

  select activity.last_active_at
    into previous_last_active_at
    from logimail.auth_session_activity as activity
   where activity.session_id = target_session_id;

  if previous_last_active_at < now() - interval '8 hours' then
    delete from auth.sessions
     where id = target_session_id
       and user_id = target_user_id;
    return query select false, 'idle_expired'::text, null::timestamptz;
    return;
  end if;

  update logimail.auth_session_activity as activity
     set last_active_at = now()
   where activity.session_id = target_session_id
  returning activity.last_active_at into previous_last_active_at;

  return query select true, 'active'::text, previous_last_active_at;
end;
$$;

revoke all on function logimail.touch_auth_session_activity(uuid, uuid) from public, anon, authenticated;
grant execute on function logimail.touch_auth_session_activity(uuid, uuid) to service_role;
