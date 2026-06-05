-- Enforce one active tenant Telegram connection per Telegram account.
-- Historical revoked rows are kept for audit, but only one active row can exist.

with ranked as (
  select
    id,
    telegram_user_id,
    first_value(id) over (
      partition by telegram_user_id
      order by
        coalesce(last_seen_at, updated_at, connected_at, created_at) desc,
        created_at desc,
        id desc
    ) as kept_connection_id,
    row_number() over (
      partition by telegram_user_id
      order by
        coalesce(last_seen_at, updated_at, connected_at, created_at) desc,
        created_at desc,
        id desc
    ) as rn
  from public.telegram_connections
  where status = 'active'
), revoked as (
  update public.telegram_connections tc
  set
    status = 'revoked',
    revoked_at = now(),
    updated_at = now(),
    metadata = coalesce(tc.metadata, '{}'::jsonb) || jsonb_build_object(
      'revokedBy', 'telegram_single_tenant_connection_lock',
      'revokedReason', 'telegram_user_single_active_connection',
      'keptConnectionId', ranked.kept_connection_id::text
    )
  from ranked
  where tc.id = ranked.id
    and ranked.rn > 1
  returning tc.id, tc.restaurant_id, tc.branch_id, tc.user_id, tc.telegram_user_id, ranked.kept_connection_id
), revoked_callbacks as (
  update public.telegram_callback_actions tca
  set status = 'revoked'
  from revoked
  where tca.connection_id = revoked.id
    and tca.status = 'pending'
    and tca.used_at is null
  returning tca.id
), deleted_sessions as (
  delete from public.telegram_sessions ts
  using revoked
  where ts.connection_id = revoked.id
  returning ts.id
)
insert into public.telegram_audit_logs (
  restaurant_id,
  branch_id,
  connection_id,
  user_id,
  telegram_user_id,
  action,
  entity_type,
  entity_id,
  outcome,
  metadata
)
select
  restaurant_id,
  branch_id,
  id,
  user_id,
  telegram_user_id,
  'telegram.connection.revoked_duplicate',
  'telegram_connection',
  id,
  'denied',
  jsonb_build_object(
    'reason', 'telegram_user_single_active_connection',
    'keptConnectionId', kept_connection_id::text,
    'source', 'migration'
  )
from revoked;

create unique index if not exists telegram_connections_active_telegram_user_unique_idx
  on public.telegram_connections (telegram_user_id)
  where status = 'active';

comment on index public.telegram_connections_active_telegram_user_unique_idx is
  'Guarantees one active tenant Telegram connection per Telegram account across all restaurants.';
