-- Mail send enforcement must be concurrent-safe: HTTP requests can reach the
-- SMTP transport in parallel, so checking a value and updating it later leaks quota.

alter table logimail.mailboxes
  add column if not exists send_rate_window_started_at timestamptz,
  add column if not exists send_rate_window_count integer not null default 0;

alter table logimail.mailboxes
  drop constraint if exists mailboxes_send_rate_window_count_check;

alter table logimail.mailboxes
  add constraint mailboxes_send_rate_window_count_check
  check (send_rate_window_count >= 0);

-- Make every pre-existing active sending domain bounded before the application
-- starts failing closed for missing configuration.
insert into logimail.domain_quotas (domain_id, workspace_id)
select id, workspace_id
  from logimail.domains
 where status = 'active'
on conflict (domain_id) do nothing;

create or replace function logimail.reserve_domain_send_quota(target_domain_id uuid)
returns table (allowed boolean, used integer, daily_limit integer)
language plpgsql
security definer
set search_path = pg_catalog, logimail
as $$
declare
  quota_row logimail.domain_quotas%rowtype;
begin
  update logimail.domain_quotas
     set used_today = case when usage_date < current_date then 1 else used_today + 1 end,
         usage_date = current_date,
         updated_at = now()
   where domain_id = target_domain_id
     and (case when usage_date < current_date then 0 else used_today end) < daily_send_limit
  returning * into quota_row;

  if found then
    return query select true, quota_row.used_today, quota_row.daily_send_limit;
    return;
  end if;

  select * into quota_row
    from logimail.domain_quotas
   where domain_id = target_domain_id;

  if found then
    return query select false,
      case when quota_row.usage_date < current_date then 0 else quota_row.used_today end,
      quota_row.daily_send_limit;
  else
    -- A domain without an explicit quota is never allowed to use SMTP.
    return query select false, 0, 0;
  end if;
end;
$$;

create or replace function logimail.reserve_mailbox_send_rate(
  target_mailbox_id uuid,
  threshold integer
)
returns table (allowed boolean, count_in_window integer)
language plpgsql
security definer
set search_path = pg_catalog, logimail
as $$
declare
  mailbox_row logimail.mailboxes%rowtype;
begin
  if threshold < 1 then
    raise exception 'threshold must be positive';
  end if;

  update logimail.mailboxes
     set send_rate_window_started_at = case
           when send_rate_window_started_at is null
             or send_rate_window_started_at <= now() - interval '1 hour' then now()
           else send_rate_window_started_at
         end,
         send_rate_window_count = case
           when send_rate_window_started_at is null
             or send_rate_window_started_at <= now() - interval '1 hour' then 1
           else send_rate_window_count + 1
         end,
         updated_at = now()
   where id = target_mailbox_id
     and status = 'active'
     and (
       send_rate_window_started_at is null
       or send_rate_window_started_at <= now() - interval '1 hour'
       or send_rate_window_count < threshold
     )
  returning * into mailbox_row;

  if found then
    return query select true, mailbox_row.send_rate_window_count;
    return;
  end if;

  select * into mailbox_row from logimail.mailboxes where id = target_mailbox_id;
  if found then
    return query select false, mailbox_row.send_rate_window_count;
  else
    return query select false, 0;
  end if;
end;
$$;

revoke all on function logimail.reserve_domain_send_quota(uuid) from public, anon, authenticated;
revoke all on function logimail.reserve_mailbox_send_rate(uuid, integer) from public, anon, authenticated;
grant execute on function logimail.reserve_domain_send_quota(uuid) to service_role;
grant execute on function logimail.reserve_mailbox_send_rate(uuid, integer) to service_role;
