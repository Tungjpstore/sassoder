-- One-time, target-bound invites. Raw invitation codes never leave the API
-- process after creation; only an HMAC hash is stored in Postgres.
create table if not exists logimail.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  target_email text not null check (target_email = lower(target_email)),
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  mailbox_id uuid not null references logimail.mailboxes(id) on delete restrict,
  mailbox_permission text not null default 'admin' check (mailbox_permission in ('read', 'send', 'admin')),
  token_hash text not null unique,
  token_hint text not null default '',
  status text not null default 'active' check (status in ('active', 'processing', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  processing_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invites_acceptance_check check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or status <> 'accepted'
  )
);

create unique index if not exists workspace_invites_one_active_target_uidx
  on logimail.workspace_invites (workspace_id, target_email)
  where status in ('active', 'processing');
create index if not exists workspace_invites_claim_idx
  on logimail.workspace_invites (token_hash, status, expires_at);
create index if not exists workspace_invites_workspace_status_idx
  on logimail.workspace_invites (workspace_id, status, created_at desc);

drop trigger if exists set_workspace_invites_updated_at on logimail.workspace_invites;
create trigger set_workspace_invites_updated_at
before update on logimail.workspace_invites
for each row execute function logimail_private.set_updated_at();

alter table logimail.workspace_invites enable row level security;
revoke all on table logimail.workspace_invites from anon, authenticated;
grant all on table logimail.workspace_invites to service_role;
