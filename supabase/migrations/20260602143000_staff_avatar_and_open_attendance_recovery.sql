insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-avatars',
  'staff-avatars',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read staff avatars" on storage.objects;
create policy "public can read staff avatars"
on storage.objects for select
to public
using (bucket_id = 'staff-avatars');

drop policy if exists "staff can upload own restaurant avatars" on storage.objects;
create policy "staff can upload own restaurant avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'staff-avatars'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
  and exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = public.current_restaurant_id()
      and sm.user_id = auth.uid()
      and sm.id::text = (storage.foldername(name))[2]
      and sm.archived_at is null
      and sm.employment_status = 'active'
  )
);

drop policy if exists "staff can update own restaurant avatars" on storage.objects;
create policy "staff can update own restaurant avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'staff-avatars'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
  and exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = public.current_restaurant_id()
      and sm.user_id = auth.uid()
      and sm.id::text = (storage.foldername(name))[2]
      and sm.archived_at is null
      and sm.employment_status = 'active'
  )
)
with check (
  bucket_id = 'staff-avatars'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
  and exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = public.current_restaurant_id()
      and sm.user_id = auth.uid()
      and sm.id::text = (storage.foldername(name))[2]
      and sm.archived_at is null
      and sm.employment_status = 'active'
  )
);

drop policy if exists "staff can delete own restaurant avatars" on storage.objects;
create policy "staff can delete own restaurant avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'staff-avatars'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
  and exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = public.current_restaurant_id()
      and sm.user_id = auth.uid()
      and sm.id::text = (storage.foldername(name))[2]
      and sm.archived_at is null
      and sm.employment_status = 'active'
  )
);

create index if not exists attendance_logs_open_by_staff_idx
on public.attendance_logs (restaurant_id, staff_member_id, clock_in_at desc)
where clock_out_at is null;

create or replace function public.consume_staff_attendance_qr_token(
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

revoke all on function public.consume_staff_attendance_qr_token(uuid, uuid, uuid, timestamptz, text) from public;
grant execute on function public.consume_staff_attendance_qr_token(uuid, uuid, uuid, timestamptz, text) to service_role;
