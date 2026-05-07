-- AI-native operating layer: memory, message history, provider observability and feedback.
-- All tenant-visible reads are scoped by app_private.current_restaurant_id().

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  customer_session_id text,
  surface text not null,
  title text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversations_surface_check check (surface in ('dashboard', 'customer', 'admin')),
  constraint ai_conversations_status_check check (status in ('active', 'archived', 'deleted'))
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role text not null,
  content text not null,
  provider text,
  model text,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_messages_role_check check (role in ('system', 'user', 'assistant', 'tool'))
);

create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  surface text not null,
  task_type text not null,
  provider text,
  model text,
  status text not null default 'success',
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_logs_surface_check check (surface in ('dashboard', 'customer', 'admin', 'system')),
  constraint ai_logs_status_check check (status in ('success', 'failed', 'blocked', 'fallback'))
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  message_id uuid references public.ai_messages(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  customer_session_id text,
  rating integer,
  label text,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_feedback_rating_check check (rating is null or rating between 1 and 5),
  constraint ai_feedback_label_check check (label is null or label in ('helpful', 'wrong', 'unsafe', 'too_long', 'bad_action', 'other'))
);

create index if not exists ai_conversations_restaurant_surface_idx
  on public.ai_conversations (restaurant_id, surface, updated_at desc);

create index if not exists ai_conversations_customer_session_idx
  on public.ai_conversations (restaurant_id, customer_session_id, updated_at desc)
  where customer_session_id is not null;

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at asc);

create index if not exists ai_messages_restaurant_created_idx
  on public.ai_messages (restaurant_id, created_at desc);

create index if not exists ai_logs_restaurant_task_idx
  on public.ai_logs (restaurant_id, task_type, created_at desc);

create index if not exists ai_feedback_restaurant_created_idx
  on public.ai_feedback (restaurant_id, created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_logs enable row level security;
alter table public.ai_feedback enable row level security;

revoke all on public.ai_conversations from anon;
revoke all on public.ai_messages from anon;
revoke all on public.ai_logs from anon;
revoke all on public.ai_feedback from anon;

grant select, insert, update on public.ai_conversations to authenticated;
grant select, insert on public.ai_messages to authenticated;
grant select, insert on public.ai_logs to authenticated;
grant select, insert on public.ai_feedback to authenticated;

drop policy if exists "restaurant users read own ai conversations" on public.ai_conversations;
create policy "restaurant users read own ai conversations"
on public.ai_conversations for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users insert own ai conversations" on public.ai_conversations;
create policy "restaurant users insert own ai conversations"
on public.ai_conversations for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users update own ai conversations" on public.ai_conversations;
create policy "restaurant users update own ai conversations"
on public.ai_conversations for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id())
with check (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users read own ai messages" on public.ai_messages;
create policy "restaurant users read own ai messages"
on public.ai_messages for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users insert own ai messages" on public.ai_messages;
create policy "restaurant users insert own ai messages"
on public.ai_messages for insert
to authenticated
with check (
  restaurant_id = app_private.current_restaurant_id()
  and exists (
    select 1
    from public.ai_conversations
    where ai_conversations.id = ai_messages.conversation_id
      and ai_conversations.restaurant_id = ai_messages.restaurant_id
  )
);

drop policy if exists "restaurant users read own ai logs" on public.ai_logs;
create policy "restaurant users read own ai logs"
on public.ai_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users insert own ai logs" on public.ai_logs;
create policy "restaurant users insert own ai logs"
on public.ai_logs for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users read own ai feedback" on public.ai_feedback;
create policy "restaurant users read own ai feedback"
on public.ai_feedback for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users insert own ai feedback" on public.ai_feedback;
create policy "restaurant users insert own ai feedback"
on public.ai_feedback for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id());

drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();
