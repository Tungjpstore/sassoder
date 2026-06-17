-- Move the privileged QR token consumer behind a private security-definer function.
-- The public RPC name stays as a service-role-only invoker wrapper so existing
-- server code can keep using Supabase RPC without exposing privileged code.

create schema if not exists app_private;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

grant execute on function app_private.current_restaurant_id() to authenticated, service_role;
grant execute on function app_private.current_user_role() to authenticated, service_role;

create or replace function app_private.consume_staff_attendance_qr_token(
  p_restaurant_id uuid,
  p_token_id uuid,
  p_staff_member_id uuid,
  p_used_at timestamptz,
  p_clock text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.staff_attendance_qr_tokens token
  set
    consumed_at = case when token.token_mode = 'daily_branch' then token.consumed_at else p_used_at end,
    consumed_by_staff_member_id = case when token.token_mode = 'daily_branch' then token.consumed_by_staff_member_id else p_staff_member_id end,
    last_used_at = p_used_at,
    usage_count = coalesce(token.usage_count, 0) + 1,
    metadata = coalesce(token.metadata, '{}'::jsonb) || jsonb_build_object(
      'lastClock', p_clock,
      'lastStaffMemberId', p_staff_member_id,
      'lastUsedMode', token.token_mode,
      'qrDate', token.qr_date
    ),
    updated_at = now()
  where token.restaurant_id = p_restaurant_id
    and token.id = p_token_id
    and token.revoked_at is null
    and (token.token_mode = 'daily_branch' or token.consumed_at is null)
    and (token.usage_limit is null or coalesce(token.usage_count, 0) < token.usage_limit)
  returning token.id;
end;
$$;

revoke all on function app_private.consume_staff_attendance_qr_token(uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function app_private.consume_staff_attendance_qr_token(uuid, uuid, uuid, timestamptz, text) to service_role;

create or replace function public.consume_staff_attendance_qr_token(
  p_restaurant_id uuid,
  p_token_id uuid,
  p_staff_member_id uuid,
  p_used_at timestamptz,
  p_clock text
)
returns table(id uuid)
language sql
security invoker
set search_path = public, app_private
as $$
  select private_result.id
  from app_private.consume_staff_attendance_qr_token(
    p_restaurant_id,
    p_token_id,
    p_staff_member_id,
    p_used_at,
    p_clock
  ) as private_result;
$$;

revoke all on function public.consume_staff_attendance_qr_token(uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.consume_staff_attendance_qr_token(uuid, uuid, uuid, timestamptz, text) to service_role;
