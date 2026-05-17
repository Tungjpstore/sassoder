-- Restaurant-scoped AI memory retrieval foundation.
-- Keeps reusable business facts separate from chat transcripts. Vector columns can
-- be added later without changing tenant/RLS lifecycle.

create extension if not exists pg_trgm;

create table if not exists public.ai_restaurant_memories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  category text not null,
  title text not null,
  content text not null,
  summary text,
  source text not null default 'manual',
  source_ref_id text,
  sensitivity text not null default 'internal',
  status text not null default 'active',
  tags text[] not null default '{}'::text[],
  search_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_restaurant_memories_category_check check (category in ('brand', 'menu', 'customer', 'operations', 'staff', 'inventory', 'marketing', 'policy', 'branch')),
  constraint ai_restaurant_memories_source_check check (source in ('manual', 'chatbot', 'ai_ops', 'import', 'system')),
  constraint ai_restaurant_memories_sensitivity_check check (sensitivity in ('public', 'internal', 'sensitive')),
  constraint ai_restaurant_memories_status_check check (status in ('active', 'archived', 'deleted')),
  constraint ai_restaurant_memories_title_length check (length(trim(title)) between 1 and 180),
  constraint ai_restaurant_memories_content_length check (length(trim(content)) between 1 and 4000),
  constraint ai_restaurant_memories_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create or replace function public.set_ai_restaurant_memory_search_text()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_text := lower(
    coalesce(new.title, '') ||
    ' ' ||
    coalesce(new.summary, '') ||
    ' ' ||
    coalesce(new.content, '') ||
    ' ' ||
    array_to_string(coalesce(new.tags, '{}'::text[]), ' ')
  );
  return new;
end;
$$;

drop trigger if exists ai_restaurant_memories_search_text on public.ai_restaurant_memories;
create trigger ai_restaurant_memories_search_text
before insert or update of title, summary, content, tags on public.ai_restaurant_memories
for each row execute function public.set_ai_restaurant_memory_search_text();

create index if not exists ai_restaurant_memories_restaurant_status_idx
  on public.ai_restaurant_memories (restaurant_id, status, updated_at desc);

create index if not exists ai_restaurant_memories_restaurant_category_idx
  on public.ai_restaurant_memories (restaurant_id, category, status, updated_at desc);

create index if not exists ai_restaurant_memories_branch_idx
  on public.ai_restaurant_memories (restaurant_id, branch_id, status, updated_at desc)
  where branch_id is not null;

create index if not exists ai_restaurant_memories_search_trgm_idx
  on public.ai_restaurant_memories using gin (search_text gin_trgm_ops);

alter table public.ai_restaurant_memories enable row level security;

revoke all on public.ai_restaurant_memories from anon;
grant select, insert, update on public.ai_restaurant_memories to authenticated;
grant select, insert, update, delete on public.ai_restaurant_memories to service_role;

drop policy if exists "restaurant users read own ai memories" on public.ai_restaurant_memories;
create policy "restaurant users read own ai memories"
on public.ai_restaurant_memories for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and status <> 'deleted');

drop policy if exists "admins create own ai memories" on public.ai_restaurant_memories;
create policy "admins create own ai memories"
on public.ai_restaurant_memories for insert
to authenticated
with check (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);

drop policy if exists "admins update own ai memories" on public.ai_restaurant_memories;
create policy "admins update own ai memories"
on public.ai_restaurant_memories for update
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
)
with check (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);

drop trigger if exists ai_restaurant_memories_set_updated_at on public.ai_restaurant_memories;
create trigger ai_restaurant_memories_set_updated_at
before update on public.ai_restaurant_memories
for each row execute function public.set_updated_at();
