grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.current_restaurant_id() to authenticated, service_role;

drop policy if exists "staff can upload own restaurant avatars" on storage.objects;
create policy "staff can upload own restaurant avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'staff-avatars'
  and (storage.foldername(name))[1] = app_private.current_restaurant_id()::text
  and exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = app_private.current_restaurant_id()
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
  and (storage.foldername(name))[1] = app_private.current_restaurant_id()::text
  and exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = app_private.current_restaurant_id()
      and sm.user_id = auth.uid()
      and sm.id::text = (storage.foldername(name))[2]
      and sm.archived_at is null
      and sm.employment_status = 'active'
  )
)
with check (
  bucket_id = 'staff-avatars'
  and (storage.foldername(name))[1] = app_private.current_restaurant_id()::text
  and exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = app_private.current_restaurant_id()
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
  and (storage.foldername(name))[1] = app_private.current_restaurant_id()::text
  and exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = app_private.current_restaurant_id()
      and sm.user_id = auth.uid()
      and sm.id::text = (storage.foldername(name))[2]
      and sm.archived_at is null
      and sm.employment_status = 'active'
  )
);
