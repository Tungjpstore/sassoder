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
alter table logimail.security_codes enable row level security;
alter table logimail.push_subscriptions enable row level security;
alter table logimail.mail_push_checkpoints enable row level security;
alter table logimail.mailbox_aliases enable row level security;
alter table logimail.mail_labels enable row level security;
alter table logimail.mail_rules enable row level security;
alter table logimail.mail_drafts enable row level security;
alter table logimail.team_mailbox_tasks enable row level security;
alter table logimail.deliverability_checks enable row level security;
alter table logimail.dmarc_reports enable row level security;
alter table logimail.bounce_events enable row level security;
alter table logimail.backup_jobs enable row level security;

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

drop policy if exists mailbox_aliases_select_member on logimail.mailbox_aliases;
create policy mailbox_aliases_select_member on logimail.mailbox_aliases
for select using (logimail_private.is_workspace_member(workspace_id));

drop policy if exists mail_labels_select_owner on logimail.mail_labels;
create policy mail_labels_select_owner on logimail.mail_labels
for select using (user_id = (select auth.uid()) or logimail_private.can_access_mailbox(mailbox_id));

drop policy if exists mail_rules_select_owner on logimail.mail_rules;
create policy mail_rules_select_owner on logimail.mail_rules
for select using (user_id = (select auth.uid()) or logimail_private.can_access_mailbox(mailbox_id));

drop policy if exists mail_drafts_select_owner on logimail.mail_drafts;
create policy mail_drafts_select_owner on logimail.mail_drafts
for select using (user_id = (select auth.uid()));

drop policy if exists team_mailbox_tasks_select_member on logimail.team_mailbox_tasks;
create policy team_mailbox_tasks_select_member on logimail.team_mailbox_tasks
for select using (logimail_private.is_workspace_member(workspace_id) or logimail_private.can_access_mailbox(mailbox_id));

drop policy if exists deliverability_checks_select_member on logimail.deliverability_checks;
create policy deliverability_checks_select_member on logimail.deliverability_checks
for select using (logimail_private.is_workspace_member(workspace_id));

drop policy if exists dmarc_reports_select_member on logimail.dmarc_reports;
create policy dmarc_reports_select_member on logimail.dmarc_reports
for select using (logimail_private.is_workspace_member(workspace_id));

drop policy if exists bounce_events_select_member on logimail.bounce_events;
create policy bounce_events_select_member on logimail.bounce_events
for select using (logimail_private.is_workspace_member(workspace_id));

drop policy if exists backup_jobs_select_member on logimail.backup_jobs;
create policy backup_jobs_select_member on logimail.backup_jobs
for select using (logimail_private.is_workspace_member(workspace_id));

revoke all on schema logimail from public, anon;
revoke all on all tables in schema logimail from public, anon;
revoke all on all sequences in schema logimail from public, anon;

grant usage on schema logimail to authenticated, service_role;
grant select, insert, update, delete on all tables in schema logimail to authenticated, service_role;
grant usage, select on all sequences in schema logimail to authenticated, service_role;

revoke all on logimail.security_codes from public, anon, authenticated;
grant select, insert, update, delete on logimail.security_codes to service_role;
revoke all on logimail.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on logimail.push_subscriptions to service_role;
revoke all on logimail.mail_push_checkpoints from public, anon, authenticated;
grant select, insert, update, delete on logimail.mail_push_checkpoints to service_role;
revoke all on logimail.mailbox_aliases, logimail.mail_labels, logimail.mail_rules, logimail.mail_drafts, logimail.team_mailbox_tasks, logimail.deliverability_checks, logimail.dmarc_reports, logimail.bounce_events, logimail.backup_jobs from public, anon;
grant select on logimail.mailbox_aliases, logimail.mail_labels, logimail.mail_rules, logimail.mail_drafts, logimail.team_mailbox_tasks, logimail.deliverability_checks, logimail.dmarc_reports, logimail.bounce_events, logimail.backup_jobs to authenticated;
grant select, insert, update, delete on logimail.mailbox_aliases, logimail.mail_labels, logimail.mail_rules, logimail.mail_drafts, logimail.team_mailbox_tasks, logimail.deliverability_checks, logimail.dmarc_reports, logimail.bounce_events, logimail.backup_jobs to service_role;

revoke update on logimail.profiles from authenticated;
grant update (full_name, avatar_url) on logimail.profiles to authenticated;

alter default privileges in schema logimail revoke all on tables from public, anon;
alter default privileges in schema logimail revoke all on sequences from public, anon;
alter default privileges in schema logimail grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema logimail grant usage, select on sequences to authenticated, service_role;

revoke all on logimail.security_codes from authenticated;
grant select, insert, update, delete on logimail.security_codes to service_role;
revoke all on logimail.push_subscriptions from authenticated;
grant select, insert, update, delete on logimail.push_subscriptions to service_role;
revoke all on logimail.mail_push_checkpoints from authenticated;
grant select, insert, update, delete on logimail.mail_push_checkpoints to service_role;
grant select on logimail.mailbox_aliases, logimail.mail_labels, logimail.mail_rules, logimail.mail_drafts, logimail.team_mailbox_tasks, logimail.deliverability_checks, logimail.dmarc_reports, logimail.bounce_events, logimail.backup_jobs to authenticated;
grant select, insert, update, delete on logimail.mailbox_aliases, logimail.mail_labels, logimail.mail_rules, logimail.mail_drafts, logimail.team_mailbox_tasks, logimail.deliverability_checks, logimail.dmarc_reports, logimail.bounce_events, logimail.backup_jobs to service_role;

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
