insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read menu images" on storage.objects;
create policy "public can read menu images"
on storage.objects for select
to public
using (bucket_id = 'menu-images');

drop policy if exists "staff can upload own menu images" on storage.objects;
create policy "staff can upload own menu images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
);

drop policy if exists "staff can update own menu images" on storage.objects;
create policy "staff can update own menu images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
)
with check (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
);

drop policy if exists "staff can delete own menu images" on storage.objects;
create policy "staff can delete own menu images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
);
