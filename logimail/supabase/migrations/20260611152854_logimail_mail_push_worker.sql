-- Add server-side mailbox polling checkpoints for LogiMail Web Push worker.

create table if not exists logimail.mail_push_checkpoints (
  mailbox_id uuid primary key references logimail.mailboxes(id) on delete cascade,
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  last_seen_uid integer not null default 0 check (last_seen_uid >= 0),
  last_notified_uid integer not null default 0 check (last_notified_uid >= 0),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mail_push_checkpoints_workspace_checked_idx
  on logimail.mail_push_checkpoints (workspace_id, last_checked_at desc);

drop trigger if exists set_mail_push_checkpoints_updated_at on logimail.mail_push_checkpoints;
create trigger set_mail_push_checkpoints_updated_at
before update on logimail.mail_push_checkpoints
for each row execute function logimail_private.set_updated_at();

alter table logimail.mail_push_checkpoints enable row level security;

revoke all on logimail.mail_push_checkpoints from public, anon, authenticated;
grant select, insert, update, delete on logimail.mail_push_checkpoints to service_role;
