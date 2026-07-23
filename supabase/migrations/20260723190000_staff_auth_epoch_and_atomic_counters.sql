-- Phase 4 staff authentication hardening.
-- Keep application session revocation and failed-attempt counters transactional.

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

alter table public.staff_members
  add column if not exists auth_revoked_at timestamptz;

create index if not exists staff_members_auth_revoked_idx
  on public.staff_members (restaurant_id, auth_revoked_at)
  where auth_revoked_at is not null;

create or replace function app_private.guard_staff_auth_epoch_on_state_change()
returns trigger
language plpgsql
set search_path = public, app_private
as $$
begin
  if old.employment_status is distinct from new.employment_status
     or old.archived_at is distinct from new.archived_at then
    -- Preserve the revocation through a later reactivation. A fresh staff
    -- login explicitly clears the epoch after Supabase verifies credentials.
    new.auth_revoked_at := coalesce(new.auth_revoked_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists staff_members_guard_auth_epoch on public.staff_members;
create trigger staff_members_guard_auth_epoch
before update of employment_status, archived_at on public.staff_members
for each row execute function app_private.guard_staff_auth_epoch_on_state_change();

create or replace function app_private.record_staff_auth_failure(
  p_restaurant_id uuid,
  p_staff_member_id uuid,
  p_auth_kind text
)
returns table(attempts integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_member public.staff_members%rowtype;
  v_attempts integer;
  v_locked_until timestamptz;
  v_now timestamptz := now();
begin
  if p_auth_kind not in ('pin', 'password') then
    raise exception 'Invalid staff auth failure kind';
  end if;

  select * into v_member
  from public.staff_members
  where restaurant_id = p_restaurant_id
    and id = p_staff_member_id
  for update;

  if not found then
    raise exception 'Staff member not found';
  end if;

  if p_auth_kind = 'pin' then
    v_attempts := least(5, greatest(0, coalesce(v_member.pin_attempts, 0)) + 1);
  else
    v_attempts := least(5, greatest(0, coalesce(v_member.app_password_attempts, 0)) + 1);
  end if;

  v_locked_until := case
    when v_attempts >= 5 then v_now + interval '10 minutes'
    else null
  end;

  if p_auth_kind = 'pin' then
    update public.staff_members
    set pin_attempts = v_attempts,
        pin_locked_until = v_locked_until,
        updated_at = v_now
    where restaurant_id = p_restaurant_id and id = p_staff_member_id;
  else
    update public.staff_members
    set app_password_attempts = v_attempts,
        app_password_locked_until = v_locked_until,
        app_password_last_failed_at = v_now,
        updated_at = v_now
    where restaurant_id = p_restaurant_id and id = p_staff_member_id;
  end if;

  attempts := v_attempts;
  locked_until := v_locked_until;
  return next;
end;
$$;

revoke all on function app_private.record_staff_auth_failure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function app_private.record_staff_auth_failure(uuid, uuid, text) to service_role;

create or replace function public.record_staff_auth_failure(
  p_restaurant_id uuid,
  p_staff_member_id uuid,
  p_auth_kind text
)
returns table(attempts integer, locked_until timestamptz)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.attempts, result.locked_until
  from app_private.record_staff_auth_failure(p_restaurant_id, p_staff_member_id, p_auth_kind) as result;
$$;

revoke all on function public.record_staff_auth_failure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_staff_auth_failure(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
