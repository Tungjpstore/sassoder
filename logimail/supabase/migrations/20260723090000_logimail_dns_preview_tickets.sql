-- One-time DNS preview tickets bind an admin confirmation to the exact
-- domain/actor/digest and prevent stale or replayed Cloudflare mutations.
create table if not exists logimail.dns_provision_previews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  confirmation_text text not null check (char_length(confirmation_text) between 10 and 160),
  status text not null default 'issued' check (status in ('issued', 'applying', 'consumed', 'superseded', 'expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dns_provision_previews_consumed_check check (
    (status = 'consumed' and consumed_at is not null)
    or (status <> 'consumed' and consumed_at is null)
  )
);

create index if not exists dns_provision_previews_actor_domain_idx
  on logimail.dns_provision_previews (actor_id, domain_id, created_at desc);
create unique index if not exists dns_provision_previews_one_issued_domain_uidx
  on logimail.dns_provision_previews (domain_id)
  where status in ('issued', 'applying');
create index if not exists dns_provision_previews_expiry_idx
  on logimail.dns_provision_previews (status, expires_at);

alter table logimail.dns_provision_previews enable row level security;
revoke all on table logimail.dns_provision_previews from public, anon, authenticated;
grant all on table logimail.dns_provision_previews to service_role;
