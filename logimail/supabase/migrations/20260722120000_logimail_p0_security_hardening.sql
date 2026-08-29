-- P0 security hardening: separate platform administration, bind reset codes,
-- and make mailbox sessions revocable without exposing credentials to clients.

alter table logimail.profiles
  add column if not exists platform_role text not null default 'none';

alter table logimail.profiles
  drop constraint if exists profiles_platform_role_check;

alter table logimail.profiles
  add constraint profiles_platform_role_check
  check (platform_role in ('none', 'platform_admin', 'platform_owner'));

-- A platform role may be staged in trusted Auth app metadata before this
-- migration. Never infer global administration from profiles.role or
-- workspace_members.role.
with promoted as (
  update logimail.profiles as p
     set platform_role = u.raw_app_meta_data ->> 'platform_role',
         updated_at = now()
    from auth.users as u
   where u.id = p.id
     and p.platform_role = 'none'
     and u.raw_app_meta_data ->> 'platform_role' in ('platform_admin', 'platform_owner')
  returning p.id, p.platform_role
)
insert into logimail.audit_logs (actor_id, action, target_type, target_id, metadata)
select null,
       'logimail.platform_role_backfilled',
       'user',
       id::text,
       jsonb_build_object('platformRole', platform_role, 'source', 'auth_app_metadata')
  from promoted;

alter table logimail.security_codes
  add column if not exists target_email text;

alter table logimail.security_codes
  drop constraint if exists security_codes_target_email_check;

alter table logimail.security_codes
  add constraint security_codes_target_email_check
  check (target_email is null or target_email = lower(target_email));

-- Domain-wide reset codes from older deployments must not remain usable after
-- target binding is introduced.
update logimail.security_codes
   set status = 'revoked',
       revoked_by = 'logimail-p0-hardening',
       revoked_at = now(),
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'revokedBy', 'logimail-p0-hardening',
         'revokedReason', 'missing_or_invalid_reset_target'
       )
 where purpose = 'password_reset'
   and status = 'active'
   and (
     domain is null
     or target_email is null
     or split_part(target_email, '@', 1) = ''
     or split_part(target_email, '@', 2) <> domain
   );

alter table logimail.security_codes
  drop constraint if exists security_codes_reset_target_required_check;

alter table logimail.security_codes
  add constraint security_codes_reset_target_required_check
  check (
    purpose <> 'password_reset'
    or status <> 'active'
    or (
      domain is not null
      and target_email is not null
      and split_part(target_email, '@', 1) <> ''
      and split_part(target_email, '@', 2) = domain
    )
  );

create index if not exists security_codes_reset_target_idx
  on logimail.security_codes (domain, target_email, purpose, status, expires_at);

alter table logimail.mailboxes
  add column if not exists session_version integer not null default 1;

alter table logimail.mailboxes
  drop constraint if exists mailboxes_session_version_check;

alter table logimail.mailboxes
  add constraint mailboxes_session_version_check
  check (session_version > 0);

create or replace function logimail.bump_mailbox_session_version(target_mailbox_id uuid)
returns integer
language sql
security definer
set search_path = pg_catalog, logimail
as $$
  update logimail.mailboxes
     set session_version = session_version + 1,
         updated_at = now()
   where id = target_mailbox_id
  returning session_version;
$$;

revoke all on function logimail.bump_mailbox_session_version(uuid) from public, anon, authenticated;
grant execute on function logimail.bump_mailbox_session_version(uuid) to service_role;

-- Revoke by target user id on the server. A client-supplied JWT is never used
-- as a stand-in for the target user's session. Mailbox cookie versions are
-- bumped in the same transaction so encrypted mailbox sessions are invalidated.
create or replace function logimail.revoke_user_sessions(target_user_id uuid, actor_user_id uuid)
returns table (auth_sessions_revoked bigint, mailbox_sessions_revoked bigint)
language plpgsql
security definer
set search_path = pg_catalog, auth, logimail
as $$
declare
  auth_count bigint := 0;
  mailbox_count bigint := 0;
begin
  if target_user_id is null or actor_user_id is null
     or not exists (select 1 from auth.users where id = target_user_id)
     or not exists (select 1 from auth.users where id = actor_user_id) then
    raise exception 'target_user_not_found' using errcode = 'P0002';
  end if;

  delete from auth.sessions where user_id = target_user_id;
  get diagnostics auth_count = row_count;

  update logimail.mailboxes as m
     set session_version = m.session_version + 1,
         updated_at = now()
   where exists (
           select 1
             from logimail.mailbox_permissions as mp
            where mp.mailbox_id = m.id
              and mp.user_id = target_user_id
         )
      or exists (
           select 1
             from auth.users as u
            where u.id = target_user_id
              and lower(u.email) = m.email_address
         );
  get diagnostics mailbox_count = row_count;

  insert into logimail.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    actor_user_id,
    'logimail.session_revoked',
    'user',
    target_user_id::text,
    jsonb_build_object('authSessionsRevoked', auth_count, 'mailboxSessionsRevoked', mailbox_count, 'source', 'service_role_rpc')
  );

  return query select auth_count, mailbox_count;
end;
$$;

revoke all on function logimail.revoke_user_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function logimail.revoke_user_sessions(uuid, uuid) to service_role;

comment on column logimail.profiles.platform_role is
  'Global control-plane role. Workspace roles live in workspace_members.role.';

comment on column logimail.security_codes.target_email is
  'Required for password_reset codes; null is allowed for domain-scoped signup codes.';

comment on column logimail.mailboxes.session_version is
  'Increment to revoke all encrypted mail-session cookies for this mailbox.';
