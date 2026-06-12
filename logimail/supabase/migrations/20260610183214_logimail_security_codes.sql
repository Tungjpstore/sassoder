-- Add one-time LogiMail security codes for closed internal signup and reset flows.
-- Codes are validated by service-role API routes only; client sessions never receive table access.

create schema if not exists logimail;
create schema if not exists logimail_private;

create extension if not exists pgcrypto;

create or replace function logimail_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists logimail.security_codes (
  id uuid primary key default gen_random_uuid(),
  domain text check (domain is null or domain = lower(domain)),
  purpose text not null default 'account_access' check (purpose in ('account_access', 'account_signup', 'password_reset')),
  code_hash text not null unique,
  code_ciphertext text,
  code_hint text not null default '',
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'revoked')),
  max_uses integer not null default 1 check (max_uses = 1),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_by text,
  consumed_by_user_id uuid references auth.users(id) on delete set null,
  consumed_email text check (consumed_email is null or consumed_email = lower(consumed_email)),
  consumed_at timestamptz,
  revoked_by text,
  revoked_at timestamptz,
  replaced_by uuid references logimail.security_codes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists security_codes_active_lookup_idx
  on logimail.security_codes (code_hash, status, expires_at);
create index if not exists security_codes_domain_status_idx
  on logimail.security_codes (domain, status, expires_at desc);
create index if not exists security_codes_created_idx
  on logimail.security_codes (created_at desc);
create index if not exists security_codes_consumed_email_idx
  on logimail.security_codes (consumed_email) where consumed_email is not null;

drop trigger if exists set_security_codes_updated_at on logimail.security_codes;
create trigger set_security_codes_updated_at
before update on logimail.security_codes
for each row execute function logimail_private.set_updated_at();

alter table logimail.security_codes enable row level security;

revoke all on logimail.security_codes from public, anon, authenticated;
grant select, insert, update, delete on logimail.security_codes to service_role;

alter default privileges in schema logimail revoke all on tables from public, anon;
