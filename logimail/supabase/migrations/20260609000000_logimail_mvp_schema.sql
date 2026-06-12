-- LogiMail MVP schema migration.
-- Generated from supabase/schema.sql and supabase/rls-policies.sql.
-- Apply only in a dedicated LogiMail Supabase project or isolated logimail schema.

-- LogiMail schema MVP.
-- Uu tien chay trong Supabase project rieng. Neu dung chung LogiVN project, chi dung schema logimail.*.

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

create table if not exists logimail.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  account_status text not null default 'pending' check (account_status in ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text,
  company_name text,
  purpose text,
  requested_workspace_name text,
  requested_slug text check (requested_slug is null or requested_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'internal' check (plan in ('internal', 'partner', 'pilot')),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create table if not exists logimail.domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain text not null check (domain = lower(domain)),
  mail_hostname text check (mail_hostname is null or mail_hostname = lower(mail_hostname)),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  registration_enabled boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'active', 'warning', 'failed', 'disabled')),
  spf_status text not null default 'unknown' check (spf_status in ('unknown', 'pass', 'fail', 'warning')),
  dkim_status text not null default 'unknown' check (dkim_status in ('unknown', 'pass', 'fail', 'warning')),
  dmarc_status text not null default 'unknown' check (dmarc_status in ('unknown', 'pass', 'fail', 'warning')),
  mx_status text not null default 'unknown' check (mx_status in ('unknown', 'pass', 'fail', 'warning')),
  ptr_status text not null default 'unknown' check (ptr_status in ('unknown', 'pass', 'fail', 'warning')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, domain)
);

create table if not exists logimail.domain_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain = lower(domain)),
  mail_hostname text not null check (mail_hostname = lower(mail_hostname)),
  cloudflare_zone_id text,
  purpose text,
  dns_plan jsonb not null default '{}'::jsonb,
  risk_flags text[] not null default '{}'::text[],
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  provisioned_domain_id uuid references logimail.domains(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  email_address text not null unique check (email_address = lower(email_address)),
  display_name text,
  quota_mb integer not null default 1024 check (quota_mb between 128 and 102400),
  status text not null default 'active' check (status in ('active', 'disabled', 'locked', 'pending')),
  provider text not null default 'billionmail' check (provider in ('billionmail')),
  provider_mailbox_id text,
  encrypted_imap_username text,
  encrypted_imap_password text,
  encrypted_smtp_username text,
  encrypted_smtp_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.mailbox_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  local_part text not null check (local_part = lower(local_part)),
  email_address text not null check (email_address = lower(email_address)),
  display_name text,
  quota_mb integer not null default 1024 check (quota_mb between 128 and 102400),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  provisioned_mailbox_id uuid references logimail.mailboxes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.mailbox_permissions (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references logimail.mailboxes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'read' check (permission in ('read', 'send', 'admin')),
  created_at timestamptz not null default now(),
  unique(mailbox_id, user_id)
);

create table if not exists logimail.email_send_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid references logimail.mailboxes(id) on delete set null,
  from_email text not null,
  to_email text not null,
  subject text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'bounced', 'deferred')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists logimail.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references logimail.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists logimail.quotas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  daily_send_limit integer not null default 500 check (daily_send_limit >= 0),
  monthly_send_limit integer not null default 5000 check (monthly_send_limit >= 0),
  used_today integer not null default 0 check (used_today >= 0),
  used_this_month integer not null default 0 check (used_this_month >= 0),
  updated_at timestamptz not null default now(),
  unique(workspace_id)
);

create or replace function logimail_private.bootstrap_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = logimail, public
as $$
begin
  insert into logimail.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  insert into logimail.quotas (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;

  return new;
end;
$$;

create index if not exists profiles_email_idx on logimail.profiles (lower(email));
create index if not exists profiles_account_status_idx on logimail.profiles (account_status);
create index if not exists account_requests_user_created_idx on logimail.account_requests (user_id, created_at desc);
create unique index if not exists account_requests_pending_user_uidx on logimail.account_requests (user_id) where status = 'pending';
create index if not exists workspaces_owner_id_idx on logimail.workspaces (owner_id);
create index if not exists workspace_members_user_id_idx on logimail.workspace_members (user_id);
create index if not exists domains_workspace_id_idx on logimail.domains (workspace_id);
create index if not exists domains_registration_lookup_idx on logimail.domains (workspace_id, approval_status, registration_enabled, status);
create index if not exists domain_requests_workspace_created_idx on logimail.domain_requests (workspace_id, created_at desc);
create index if not exists domain_requests_requested_by_idx on logimail.domain_requests (requested_by, created_at desc);
create unique index if not exists domain_requests_pending_workspace_domain_uidx on logimail.domain_requests (workspace_id, domain) where status = 'pending';
create index if not exists mailboxes_workspace_id_idx on logimail.mailboxes (workspace_id);
create index if not exists mailboxes_domain_id_idx on logimail.mailboxes (domain_id);
create index if not exists mailbox_requests_workspace_created_idx on logimail.mailbox_requests (workspace_id, created_at desc);
create index if not exists mailbox_requests_requested_by_idx on logimail.mailbox_requests (requested_by, created_at desc);
create unique index if not exists mailbox_requests_pending_email_uidx on logimail.mailbox_requests (email_address) where status = 'pending';
create index if not exists mailbox_permissions_user_id_idx on logimail.mailbox_permissions (user_id);
create index if not exists email_send_logs_workspace_created_idx on logimail.email_send_logs (workspace_id, created_at desc);
create index if not exists audit_logs_workspace_created_idx on logimail.audit_logs (workspace_id, created_at desc);

drop trigger if exists set_profiles_updated_at on logimail.profiles;
create trigger set_profiles_updated_at
before update on logimail.profiles
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_account_requests_updated_at on logimail.account_requests;
create trigger set_account_requests_updated_at
before update on logimail.account_requests
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_workspaces_updated_at on logimail.workspaces;
create trigger set_workspaces_updated_at
before update on logimail.workspaces
for each row execute function logimail_private.set_updated_at();

drop trigger if exists bootstrap_workspace_owner_membership on logimail.workspaces;
create trigger bootstrap_workspace_owner_membership
after insert on logimail.workspaces
for each row execute function logimail_private.bootstrap_workspace_owner_membership();

drop trigger if exists set_domains_updated_at on logimail.domains;
create trigger set_domains_updated_at
before update on logimail.domains
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_domain_requests_updated_at on logimail.domain_requests;
create trigger set_domain_requests_updated_at
before update on logimail.domain_requests
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mailboxes_updated_at on logimail.mailboxes;
create trigger set_mailboxes_updated_at
before update on logimail.mailboxes
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mailbox_requests_updated_at on logimail.mailbox_requests;
create trigger set_mailbox_requests_updated_at
before update on logimail.mailbox_requests
for each row execute function logimail_private.set_updated_at();

drop function if exists logimail.bootstrap_workspace_owner_membership();
drop function if exists logimail.set_updated_at();


-- LogiMail RLS MVP.
-- Chay sau schema.sql. Khong tat RLS trong production.

alter table logimail.profiles enable row level security;
alter table logimail.account_requests enable row level security;
alter table logimail.workspaces enable row level security;
alter table logimail.workspace_members enable row level security;
alter table logimail.domains enable row level security;
alter table logimail.domain_requests enable row level security;
alter table logimail.mailboxes enable row level security;
alter table logimail.mailbox_requests enable row level security;
alter table logimail.mailbox_permissions enable row level security;
alter table logimail.email_send_logs enable row level security;
alter table logimail.audit_logs enable row level security;
alter table logimail.quotas enable row level security;

create or replace function logimail_private.is_approved_account(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = logimail, public
as $$
  select exists (
    select 1
    from logimail.profiles p
    where p.id = target_user_id
      and p.account_status = 'approved'
  );
$$;

create or replace function logimail_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = logimail, public
as $$
  select (select auth.uid()) is not null
    and logimail_private.is_approved_account((select auth.uid()))
    and (
      exists (
        select 1
        from logimail.workspace_members wm
        where wm.workspace_id = target_workspace_id
          and wm.user_id = (select auth.uid())
      )
      or exists (
        select 1
        from logimail.workspaces w
        where w.id = target_workspace_id
          and w.owner_id = (select auth.uid())
      )
  );
$$;

create or replace function logimail_private.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = logimail, public
as $$
  select (select auth.uid()) is not null
    and logimail_private.is_approved_account((select auth.uid()))
    and (
      exists (
        select 1
        from logimail.workspaces w
        where w.id = target_workspace_id
          and w.owner_id = (select auth.uid())
          and 'owner' = any(allowed_roles)
      )
      or exists (
        select 1
        from logimail.workspace_members wm
        where wm.workspace_id = target_workspace_id
          and wm.user_id = (select auth.uid())
          and wm.role = any(allowed_roles)
      )
  );
$$;

create or replace function logimail_private.can_access_mailbox(target_mailbox_id uuid)
returns boolean
language sql
security definer
set search_path = logimail, public
as $$
  select (select auth.uid()) is not null
    and logimail_private.is_approved_account((select auth.uid()))
    and (
      exists (
        select 1
        from logimail.mailboxes m
        where m.id = target_mailbox_id
          and logimail_private.is_workspace_member(m.workspace_id)
      )
      or exists (
        select 1
        from logimail.mailbox_permissions mp
        where mp.mailbox_id = target_mailbox_id
          and mp.user_id = (select auth.uid())
      )
  );
$$;

drop policy if exists profiles_select_self on logimail.profiles;
create policy profiles_select_self on logimail.profiles
for select using ((select auth.uid()) is not null and id = (select auth.uid()));

drop policy if exists profiles_insert_self on logimail.profiles;
create policy profiles_insert_self on logimail.profiles
for insert with check ((select auth.uid()) is not null and id = (select auth.uid()) and role = 'member' and account_status = 'pending');

drop policy if exists profiles_update_self on logimail.profiles;
create policy profiles_update_self on logimail.profiles
for update using ((select auth.uid()) is not null and id = (select auth.uid())) with check ((select auth.uid()) is not null and id = (select auth.uid()));

drop policy if exists account_requests_select_self on logimail.account_requests;
create policy account_requests_select_self on logimail.account_requests
for select using ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists account_requests_insert_self on logimail.account_requests;
create policy account_requests_insert_self on logimail.account_requests
for insert with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists workspaces_select_member on logimail.workspaces;
create policy workspaces_select_member on logimail.workspaces
for select using (logimail_private.is_workspace_member(id));

drop policy if exists workspaces_insert_owner on logimail.workspaces;
drop policy if exists workspaces_update_admin on logimail.workspaces;

drop policy if exists workspace_members_select_member on logimail.workspace_members;
create policy workspace_members_select_member on logimail.workspace_members
for select using (logimail_private.is_workspace_member(workspace_id));

drop policy if exists workspace_members_write_admin on logimail.workspace_members;

drop policy if exists domains_select_member on logimail.domains;
create policy domains_select_member on logimail.domains
for select using (logimail_private.is_workspace_member(workspace_id));

drop policy if exists domains_write_admin on logimail.domains;

drop policy if exists domain_requests_select_related on logimail.domain_requests;
create policy domain_requests_select_related on logimail.domain_requests
for select using (requested_by = (select auth.uid()) or logimail_private.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists domain_requests_insert_workspace_admin on logimail.domain_requests;
create policy domain_requests_insert_workspace_admin on logimail.domain_requests
for insert with check (
  (select auth.uid()) is not null
  and requested_by = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and logimail_private.has_workspace_role(workspace_id, array['owner', 'admin'])
);

drop policy if exists mailboxes_select_member_or_permission on logimail.mailboxes;
create policy mailboxes_select_member_or_permission on logimail.mailboxes
for select using (logimail_private.is_workspace_member(workspace_id) or logimail_private.can_access_mailbox(id));

drop policy if exists mailboxes_write_admin on logimail.mailboxes;

drop policy if exists mailbox_requests_select_related on logimail.mailbox_requests;
create policy mailbox_requests_select_related on logimail.mailbox_requests
for select using (requested_by = (select auth.uid()) or logimail_private.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists mailbox_requests_insert_member on logimail.mailbox_requests;
create policy mailbox_requests_insert_member on logimail.mailbox_requests
for insert with check (
  (select auth.uid()) is not null
  and requested_by = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and logimail_private.is_workspace_member(workspace_id)
);

drop policy if exists mailbox_permissions_select_related on logimail.mailbox_permissions;
create policy mailbox_permissions_select_related on logimail.mailbox_permissions
for select using (user_id = (select auth.uid()) or logimail_private.can_access_mailbox(mailbox_id));

drop policy if exists mailbox_permissions_write_admin on logimail.mailbox_permissions;

drop policy if exists email_send_logs_select_member on logimail.email_send_logs;
create policy email_send_logs_select_member on logimail.email_send_logs
for select using (logimail_private.is_workspace_member(workspace_id));

drop policy if exists audit_logs_select_admin on logimail.audit_logs;
create policy audit_logs_select_admin on logimail.audit_logs
for select using (workspace_id is not null and logimail_private.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists quotas_select_member on logimail.quotas;
create policy quotas_select_member on logimail.quotas
for select using (logimail_private.is_workspace_member(workspace_id));

drop policy if exists quotas_write_admin on logimail.quotas;

revoke all on schema logimail from public, anon;
revoke all on all tables in schema logimail from public, anon;
revoke all on all sequences in schema logimail from public, anon;

grant usage on schema logimail to authenticated, service_role;
grant select, insert, update, delete on all tables in schema logimail to authenticated, service_role;
grant usage, select on all sequences in schema logimail to authenticated, service_role;

revoke update on logimail.profiles from authenticated;
grant update (full_name, avatar_url) on logimail.profiles to authenticated;

alter default privileges in schema logimail revoke all on tables from public, anon;
alter default privileges in schema logimail revoke all on sequences from public, anon;
alter default privileges in schema logimail grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema logimail grant usage, select on sequences to authenticated, service_role;

revoke all on schema logimail_private from public, anon;
revoke all on all functions in schema logimail_private from public, anon;
grant usage on schema logimail_private to authenticated, service_role;
grant execute on all functions in schema logimail_private to authenticated, service_role;

alter default privileges in schema logimail_private revoke execute on functions from public, anon;
alter default privileges in schema logimail_private grant execute on functions to authenticated, service_role;

drop function if exists logimail.can_access_mailbox(uuid);
drop function if exists logimail.has_workspace_role(uuid, text[]);
drop function if exists logimail.is_approved_account(uuid);
drop function if exists logimail.is_workspace_member(uuid);
