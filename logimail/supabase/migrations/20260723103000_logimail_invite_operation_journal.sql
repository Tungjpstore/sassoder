-- Durable workspace-invite saga journal. External password mutations are
-- converged forward by the API; all database mutations commit atomically here.

create table if not exists logimail.workspace_invite_operations (
  attempt_id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references logimail.workspace_invites(id) on delete cascade,
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid not null references logimail.mailboxes(id) on delete restrict,
  target_email text not null check (target_email = lower(target_email)),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'aborted', 'manual_review')),
  stage text not null default 'claimed'
    check (stage in (
      'claimed',
      'recovery_claimed',
      'provider_started',
      'provider_applied',
      'auth_started',
      'auth_applied',
      'commit_started',
      'recovery_required',
      'completed',
      'aborted',
      'manual_review'
    )),
  lease_token uuid,
  lease_version integer not null default 1 check (lease_version > 0),
  lease_expires_at timestamptz,
  existing_user_id uuid references auth.users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_auth_user boolean not null default false,
  previous_password_ciphertext text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  aborted_at timestamptz
);

create unique index if not exists workspace_invite_operations_live_uidx
  on logimail.workspace_invite_operations (invite_id)
  where status in ('processing', 'completed', 'manual_review');

create index if not exists workspace_invite_operations_lease_idx
  on logimail.workspace_invite_operations (status, lease_expires_at)
  where status = 'processing';

drop trigger if exists set_workspace_invite_operations_updated_at on logimail.workspace_invite_operations;
create trigger set_workspace_invite_operations_updated_at
before update on logimail.workspace_invite_operations
for each row execute function logimail_private.set_updated_at();

alter table logimail.workspace_invite_operations enable row level security;
revoke all on table logimail.workspace_invite_operations from anon, authenticated;
grant all on table logimail.workspace_invite_operations to service_role;

-- Existing processing rows predate durable stage tracking. Their external
-- side effects are unknowable, so they are quarantined rather than reclaimed.
insert into logimail.workspace_invite_operations (
  invite_id,
  workspace_id,
  mailbox_id,
  target_email,
  status,
  stage,
  lease_version,
  lease_expires_at,
  previous_password_ciphertext,
  last_error,
  metadata
)
select
  wi.id,
  wi.workspace_id,
  wi.mailbox_id,
  wi.target_email,
  'manual_review',
  'manual_review',
  1,
  wi.processing_at,
  m.encrypted_imap_password,
  'legacy_processing_without_journal',
  jsonb_build_object('reason', 'legacy_processing_without_journal', 'processingAt', wi.processing_at)
from logimail.workspace_invites as wi
join logimail.mailboxes as m on m.id = wi.mailbox_id
where wi.status = 'processing'
  and not exists (
    select 1
    from logimail.workspace_invite_operations as existing
    where existing.invite_id = wi.id
  );

create or replace function logimail.claim_workspace_invite_operation(
  target_token_hash text,
  requested_email text,
  new_lease_token uuid,
  lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, logimail
as $$
declare
  wi record;
  op record;
  profile_row record;
  auth_row record;
  new_attempt_id uuid;
  bounded_lease_seconds integer := greatest(60, least(coalesce(lease_seconds, 300), 900));
begin
  if target_token_hash is null or target_token_hash = ''
     or requested_email is null or lower(requested_email) <> requested_email
     or new_lease_token is null then
    raise exception 'invalid_invite_claim' using errcode = '22023';
  end if;

  select wi0.*, m.encrypted_imap_password, m.display_name, m.quota_mb
    into wi
    from logimail.workspace_invites as wi0
    join logimail.mailboxes as m on m.id = wi0.mailbox_id
   where wi0.token_hash = target_token_hash
     and wi0.target_email = lower(requested_email)
     and wi0.status in ('active', 'processing', 'accepted')
   for update of wi0;

  if not found then
    return null;
  end if;

  select op0.*
    into op
    from logimail.workspace_invite_operations as op0
   where op0.invite_id = wi.id
     and op0.status in ('processing', 'completed', 'manual_review')
   order by op0.created_at desc
   limit 1
   for update;

  if wi.status = 'accepted' then
    if op.attempt_id is not null and op.status = 'completed' then
      return jsonb_build_object(
        'state', 'completed',
        'attemptId', op.attempt_id,
        'workspaceId', wi.workspace_id,
        'mailboxId', wi.mailbox_id,
        'email', wi.target_email,
        'userId', op.user_id
      );
    end if;
    return null;
  end if;

  if wi.expires_at < now() then
    update logimail.workspace_invites
       set status = 'expired', processing_at = null
     where id = wi.id;
    return null;
  end if;

  if wi.status = 'active' then
    select p.id, p.account_status
      into profile_row
      from logimail.profiles as p
     where p.email = wi.target_email;

    if profile_row.id is not null and profile_row.account_status <> 'approved' then
      raise exception 'invite_account_unavailable' using errcode = 'P0001';
    end if;

    if profile_row.id is null then
      select u.id, u.raw_app_meta_data
        into auth_row
        from auth.users as u
       where lower(u.email) = wi.target_email;
      if auth_row.id is not null then
        raise exception 'invite_account_unavailable' using errcode = 'P0001';
      end if;
    end if;

    new_attempt_id := gen_random_uuid();
    insert into logimail.workspace_invite_operations (
      attempt_id,
      invite_id,
      workspace_id,
      mailbox_id,
      target_email,
      status,
      stage,
      lease_token,
      lease_version,
      lease_expires_at,
      existing_user_id,
      user_id,
      created_auth_user,
      previous_password_ciphertext,
      metadata
    ) values (
      new_attempt_id,
      wi.id,
      wi.workspace_id,
      wi.mailbox_id,
      wi.target_email,
      'processing',
      'claimed',
      new_lease_token,
      1,
      now() + make_interval(secs => bounded_lease_seconds),
      profile_row.id,
      profile_row.id,
      false,
      wi.encrypted_imap_password,
      jsonb_build_object('claimSource', 'invite_accept_api')
    );

    update logimail.workspace_invites
       set status = 'processing', processing_at = now()
     where id = wi.id
       and status = 'active';

    select * into op
      from logimail.workspace_invite_operations
     where attempt_id = new_attempt_id;
  else
    if op.attempt_id is null or op.status = 'manual_review' then
      return jsonb_build_object('state', 'manual_review');
    end if;
    if op.status <> 'processing' then
      return null;
    end if;
    if op.lease_expires_at is not null and op.lease_expires_at >= now() then
      return jsonb_build_object('state', 'busy');
    end if;

    if op.user_id is null then
      select u.id, u.raw_app_meta_data
        into auth_row
        from auth.users as u
       where lower(u.email) = wi.target_email;
      if auth_row.id is not null then
        if auth_row.raw_app_meta_data ->> 'logimail_invite_attempt_id' = op.attempt_id::text then
          update logimail.workspace_invite_operations
             set user_id = auth_row.id,
                 created_auth_user = true
           where attempt_id = op.attempt_id;
        elsif op.existing_user_id is null then
          update logimail.workspace_invite_operations
             set status = 'manual_review',
                 stage = 'manual_review',
                 last_error = 'unexpected_auth_identity_during_recovery',
                 lease_token = null,
                 lease_expires_at = null
           where attempt_id = op.attempt_id;
          return jsonb_build_object('state', 'manual_review');
        end if;
      end if;
    end if;

    update logimail.workspace_invite_operations
       set stage = 'recovery_claimed',
           lease_token = new_lease_token,
           lease_version = lease_version + 1,
           lease_expires_at = now() + make_interval(secs => bounded_lease_seconds),
           last_error = null,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('recovered', true)
     where attempt_id = op.attempt_id
       and status = 'processing'
       and (lease_expires_at is null or lease_expires_at < now())
    returning * into op;

    if op.attempt_id is null then
      return jsonb_build_object('state', 'busy');
    end if;
  end if;

  return jsonb_build_object(
    'state', case when op.stage = 'recovery_claimed' then 'recovered' else 'claimed' end,
    'attemptId', op.attempt_id,
    'leaseToken', op.lease_token,
    'leaseVersion', op.lease_version,
    'inviteId', wi.id,
    'workspaceId', wi.workspace_id,
    'mailboxId', wi.mailbox_id,
    'email', wi.target_email,
    'role', wi.role,
    'mailboxPermission', wi.mailbox_permission,
    'invitedBy', wi.invited_by,
    'displayName', wi.display_name,
    'quotaMb', wi.quota_mb,
    'previousPasswordCiphertext', op.previous_password_ciphertext,
    'existingUserId', op.existing_user_id,
    'userId', op.user_id,
    'createdAuthUser', op.created_auth_user
  );
end;
$$;

create or replace function logimail.touch_workspace_invite_operation(
  target_attempt_id uuid,
  target_lease_token uuid,
  expected_lease_version integer,
  next_stage text,
  lease_seconds integer default 300,
  operation_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, logimail
as $$
declare
  op record;
  bounded_lease_seconds integer := greatest(60, least(coalesce(lease_seconds, 300), 900));
begin
  if next_stage not in ('provider_started', 'provider_applied', 'auth_started', 'commit_started') then
    raise exception 'invalid_invite_operation_stage' using errcode = '22023';
  end if;

  update logimail.workspace_invite_operations
     set stage = next_stage,
         lease_expires_at = now() + make_interval(secs => bounded_lease_seconds),
         last_error = operation_error
   where attempt_id = target_attempt_id
     and status = 'processing'
     and lease_token = target_lease_token
     and lease_version = expected_lease_version
     and lease_expires_at >= now()
  returning * into op;

  if op.attempt_id is null then
    raise exception 'invite_operation_lease_lost' using errcode = 'P0001';
  end if;
  return jsonb_build_object('attemptId', op.attempt_id, 'stage', op.stage, 'leaseVersion', op.lease_version);
end;
$$;

create or replace function logimail.bind_workspace_invite_operation_user(
  target_attempt_id uuid,
  target_lease_token uuid,
  expected_lease_version integer,
  target_user_id uuid,
  auth_user_created boolean,
  lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, logimail
as $$
declare
  op record;
  auth_email text;
  auth_metadata jsonb;
  bounded_lease_seconds integer := greatest(60, least(coalesce(lease_seconds, 300), 900));
begin
  select lower(u.email), u.raw_app_meta_data
    into auth_email, auth_metadata
    from auth.users as u
   where u.id = target_user_id;

  update logimail.workspace_invite_operations
     set user_id = target_user_id,
         created_auth_user = auth_user_created,
         stage = 'auth_applied',
         lease_expires_at = now() + make_interval(secs => bounded_lease_seconds)
   where attempt_id = target_attempt_id
     and status = 'processing'
     and lease_token = target_lease_token
     and lease_version = expected_lease_version
     and lease_expires_at >= now()
     and target_email = auth_email
     and (existing_user_id is null or existing_user_id = target_user_id)
     and (
       not auth_user_created
       or auth_metadata ->> 'logimail_invite_attempt_id' = target_attempt_id::text
     )
  returning * into op;

  if op.attempt_id is null then
    raise exception 'invite_operation_user_bind_failed' using errcode = 'P0001';
  end if;
  return jsonb_build_object('attemptId', op.attempt_id, 'stage', op.stage, 'userId', op.user_id);
end;
$$;

create or replace function logimail.commit_workspace_invite_operation(
  target_attempt_id uuid,
  target_lease_token uuid,
  expected_lease_version integer,
  new_encrypted_username text,
  new_encrypted_password text,
  new_credential_key_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, logimail
as $$
declare
  op record;
  wi record;
  existing_profile record;
  existing_role text;
  existing_permission text;
  updated_mailbox_id uuid;
  updated_invite_id uuid;
begin
  select * into op
    from logimail.workspace_invite_operations
   where attempt_id = target_attempt_id
     and status = 'processing'
     and lease_token = target_lease_token
     and lease_version = expected_lease_version
     and lease_expires_at >= now()
     and stage in ('auth_applied', 'commit_started')
   for update;

  if op.attempt_id is null or op.user_id is null then
    raise exception 'invite_operation_commit_not_ready' using errcode = 'P0001';
  end if;

  select * into wi
    from logimail.workspace_invites
   where id = op.invite_id
     and status = 'processing'
     and target_email = op.target_email
   for update;
  if wi.id is null then
    raise exception 'invite_operation_claim_lost' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from auth.users as u
     where u.id = op.user_id and lower(u.email) = op.target_email
  ) then
    raise exception 'invite_operation_auth_user_missing' using errcode = 'P0001';
  end if;

  select p.id, p.account_status into existing_profile
    from logimail.profiles as p
   where p.email = op.target_email;

  if existing_profile.id is null then
    insert into logimail.profiles (id, email, full_name, role, account_status)
    values (op.user_id, op.target_email, split_part(op.target_email, '@', 1), 'member', 'approved');
  elsif existing_profile.id <> op.user_id or existing_profile.account_status <> 'approved' then
    raise exception 'invite_operation_profile_conflict' using errcode = 'P0001';
  end if;

  select wm.role into existing_role
    from logimail.workspace_members as wm
   where wm.workspace_id = op.workspace_id and wm.user_id = op.user_id;
  if existing_role is null then
    insert into logimail.workspace_members (workspace_id, user_id, role)
    values (op.workspace_id, op.user_id, wi.role);
  elsif existing_role <> wi.role then
    raise exception 'invite_operation_membership_conflict' using errcode = 'P0001';
  end if;

  select mp.permission into existing_permission
    from logimail.mailbox_permissions as mp
   where mp.mailbox_id = op.mailbox_id and mp.user_id = op.user_id;
  if existing_permission is null then
    insert into logimail.mailbox_permissions (mailbox_id, user_id, permission)
    values (op.mailbox_id, op.user_id, wi.mailbox_permission);
  elsif existing_permission <> wi.mailbox_permission then
    raise exception 'invite_operation_permission_conflict' using errcode = 'P0001';
  end if;

  update logimail.mailboxes
     set encrypted_imap_username = new_encrypted_username,
         encrypted_imap_password = new_encrypted_password,
         encrypted_smtp_username = new_encrypted_username,
         encrypted_smtp_password = new_encrypted_password,
         credential_key_version = new_credential_key_version,
         session_version = session_version + 1,
         updated_at = now()
   where id = op.mailbox_id
     and workspace_id = op.workspace_id
     and email_address = op.target_email
     and status = 'active'
  returning id into updated_mailbox_id;
  if updated_mailbox_id is null then
    raise exception 'invite_operation_mailbox_missing' using errcode = 'P0001';
  end if;

  update logimail.workspace_invites
     set status = 'accepted',
         accepted_by = op.user_id,
         accepted_at = now(),
         processing_at = null
   where id = op.invite_id
     and status = 'processing'
  returning id into updated_invite_id;
  if updated_invite_id is null then
    raise exception 'invite_operation_accept_failed' using errcode = 'P0001';
  end if;

  update logimail.workspace_invite_operations
     set status = 'completed',
         stage = 'completed',
         lease_token = null,
         lease_expires_at = null,
         completed_at = now(),
         last_error = null
   where attempt_id = op.attempt_id;

  insert into logimail.audit_logs (workspace_id, actor_id, action, target_type, target_id, metadata)
  values (
    op.workspace_id,
    op.user_id,
    'team.invite_accept',
    'workspace_invite',
    op.invite_id::text,
    jsonb_build_object(
      'invitedBy', wi.invited_by,
      'mailboxId', op.mailbox_id,
      'role', wi.role,
      'provider', 'billionmail',
      'attemptId', op.attempt_id,
      'recovered', coalesce((op.metadata ->> 'recovered')::boolean, false)
    )
  );

  return jsonb_build_object(
    'state', 'completed',
    'attemptId', op.attempt_id,
    'workspaceId', op.workspace_id,
    'mailboxId', op.mailbox_id,
    'email', op.target_email,
    'userId', op.user_id
  );
end;
$$;

create or replace function logimail.abort_workspace_invite_operation(
  target_attempt_id uuid,
  target_lease_token uuid,
  expected_lease_version integer,
  operation_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, logimail
as $$
declare
  op record;
begin
  update logimail.workspace_invite_operations
     set status = 'aborted',
         stage = 'aborted',
         lease_token = null,
         lease_expires_at = null,
         aborted_at = now(),
         last_error = left(operation_error, 1000)
   where attempt_id = target_attempt_id
     and status = 'processing'
     and lease_token = target_lease_token
     and lease_version = expected_lease_version
  returning * into op;

  if op.attempt_id is null then
    return false;
  end if;

  update logimail.workspace_invites
     set status = case when expires_at < now() then 'expired' else 'active' end,
         processing_at = null,
         accepted_by = null,
         accepted_at = null
   where id = op.invite_id
     and status = 'processing';
  return true;
end;
$$;

create or replace function logimail.require_workspace_invite_recovery(
  target_attempt_id uuid,
  target_lease_token uuid,
  expected_lease_version integer,
  operation_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, logimail
as $$
begin
  update logimail.workspace_invite_operations
     set stage = 'recovery_required',
         lease_token = null,
         lease_expires_at = now() - interval '1 second',
         last_error = left(operation_error, 1000)
   where attempt_id = target_attempt_id
     and status = 'processing'
     and lease_token = target_lease_token
     and lease_version = expected_lease_version;
  return found;
end;
$$;

revoke all on function logimail.claim_workspace_invite_operation(text, text, uuid, integer) from public, anon, authenticated;
revoke all on function logimail.touch_workspace_invite_operation(uuid, uuid, integer, text, integer, text) from public, anon, authenticated;
revoke all on function logimail.bind_workspace_invite_operation_user(uuid, uuid, integer, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function logimail.commit_workspace_invite_operation(uuid, uuid, integer, text, text, integer) from public, anon, authenticated;
revoke all on function logimail.abort_workspace_invite_operation(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function logimail.require_workspace_invite_recovery(uuid, uuid, integer, text) from public, anon, authenticated;

grant execute on function logimail.claim_workspace_invite_operation(text, text, uuid, integer) to service_role;
grant execute on function logimail.touch_workspace_invite_operation(uuid, uuid, integer, text, integer, text) to service_role;
grant execute on function logimail.bind_workspace_invite_operation_user(uuid, uuid, integer, uuid, boolean, integer) to service_role;
grant execute on function logimail.commit_workspace_invite_operation(uuid, uuid, integer, text, text, integer) to service_role;
grant execute on function logimail.abort_workspace_invite_operation(uuid, uuid, integer, text) to service_role;
grant execute on function logimail.require_workspace_invite_recovery(uuid, uuid, integer, text) to service_role;

comment on table logimail.workspace_invite_operations is
  'Durable saga journal for cross-system invite acceptance. Stale leases may only be recovered through the exact invite token and email.';
