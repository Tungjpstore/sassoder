-- Require an actor scope for newly persisted AI conversations.
-- This prevents tenant/thread-only history from being reusable across anonymous actors.

alter table public.ai_conversations
  drop constraint if exists ai_conversations_actor_scope_check;

alter table public.ai_conversations
  add constraint ai_conversations_actor_scope_check
  check (
    (
      surface = 'customer'
      and customer_session_id is not null
      and btrim(customer_session_id) <> ''
    )
    or (
      surface in ('dashboard', 'admin')
      and user_id is not null
    )
  )
  not valid;

create index if not exists ai_conversations_user_surface_thread_idx
  on public.ai_conversations (restaurant_id, user_id, surface, updated_at desc)
  where user_id is not null;

create index if not exists ai_conversations_customer_surface_thread_idx
  on public.ai_conversations (restaurant_id, customer_session_id, surface, updated_at desc)
  where customer_session_id is not null;
