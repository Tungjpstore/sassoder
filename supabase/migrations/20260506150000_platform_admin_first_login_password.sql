create table if not exists public.platform_admin_credentials (
  id text primary key default 'primary',
  password_hash text not null,
  password_salt text not null,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint platform_admin_credentials_singleton check (id = 'primary')
);

alter table public.platform_admin_credentials enable row level security;

revoke all on table public.platform_admin_credentials from anon;
revoke all on table public.platform_admin_credentials from authenticated;

drop trigger if exists platform_admin_credentials_set_updated_at on public.platform_admin_credentials;
create trigger platform_admin_credentials_set_updated_at
before update on public.platform_admin_credentials
for each row execute function public.set_updated_at();

create index if not exists platform_admin_credentials_updated_idx
  on public.platform_admin_credentials (updated_at desc);
