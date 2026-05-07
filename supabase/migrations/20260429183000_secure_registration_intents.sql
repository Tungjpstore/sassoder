-- Store pending restaurant setup until the owner verifies email OTP.
-- No client-side policy is added: these rows are managed only by server-side
-- service-role code during signup and auth callback/OTP verification.

create table if not exists public.registration_intents (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  consumed_at timestamptz,
  constraint registration_intents_email_format check (position('@' in email) > 1)
);

create index if not exists registration_intents_user_pending_idx
  on public.registration_intents (user_id, created_at desc)
  where consumed_at is null;

create index if not exists registration_intents_email_pending_idx
  on public.registration_intents (email, created_at desc)
  where consumed_at is null;

alter table public.registration_intents enable row level security;
