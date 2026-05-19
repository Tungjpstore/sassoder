-- Reservation realtime hardening:
-- dashboard availability depends on lock, table metadata and active bill changes.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservation_table_locks'
  ) then
    alter publication supabase_realtime add table public.reservation_table_locks;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tables'
  ) then
    alter publication supabase_realtime add table public.tables;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'table_bills'
  ) then
    alter publication supabase_realtime add table public.table_bills;
  end if;
end $$;
