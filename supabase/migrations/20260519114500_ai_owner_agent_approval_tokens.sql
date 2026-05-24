-- One-time server-signed approval tokens for confirm-first AI owner agent actions.

create table if not exists public.ai_owner_agent_approval_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  token_nonce text not null,
  token_hash text not null,
  domain text not null,
  command text not null,
  message_hash text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_owner_agent_approval_tokens_status_check check (status in ('pending', 'consumed', 'expired')),
  constraint ai_owner_agent_approval_tokens_nonce_unique unique (token_nonce),
  constraint ai_owner_agent_approval_tokens_hash_unique unique (token_hash)
);

create index if not exists ai_owner_agent_approval_tokens_scope_idx
  on public.ai_owner_agent_approval_tokens (restaurant_id, user_id, domain, command, status, expires_at desc);

alter table public.ai_owner_agent_approval_tokens enable row level security;

revoke all on public.ai_owner_agent_approval_tokens from anon;
revoke all on public.ai_owner_agent_approval_tokens from authenticated;
grant select, insert, update, delete on public.ai_owner_agent_approval_tokens to service_role;

drop trigger if exists ai_owner_agent_approval_tokens_set_updated_at on public.ai_owner_agent_approval_tokens;
create trigger ai_owner_agent_approval_tokens_set_updated_at
before update on public.ai_owner_agent_approval_tokens
for each row execute function public.set_updated_at();
