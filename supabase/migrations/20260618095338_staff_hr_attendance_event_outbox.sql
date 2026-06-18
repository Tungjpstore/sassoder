-- P3 HR Staff attendance event durability.
-- The operational_event_outbox table already stores staff.request_created and
-- staff.incident_reported events. This seed adds staff.checked_out so ending a
-- shift can flow through the same Telegram/realtime retry path as check-in.

insert into public.telegram_notification_policies (
  restaurant_id,
  branch_id,
  event_type,
  label,
  enabled,
  recipient_scope,
  required_permission,
  priority,
  escalation_after_seconds,
  escalate_to_admin,
  digest_enabled,
  metadata
)
select
  restaurants.id,
  null,
  'staff.checked_out',
  'Nhân sự kết ca',
  true,
  'permission',
  'attendance.view',
  4,
  3600,
  true,
  false,
  jsonb_build_object('seededBy', 'staff_hr_attendance_event_outbox')
from public.restaurants restaurants
where exists (
  select 1
  from information_schema.tables tables
  where tables.table_schema = 'public'
    and tables.table_name = 'telegram_notification_policies'
)
on conflict (restaurant_id, (coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)), event_type)
do update set
  label = excluded.label,
  required_permission = excluded.required_permission,
  priority = excluded.priority,
  escalation_after_seconds = excluded.escalation_after_seconds,
  metadata = public.telegram_notification_policies.metadata || excluded.metadata,
  updated_at = now();
