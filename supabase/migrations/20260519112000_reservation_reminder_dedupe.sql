-- Reservation reminder scheduling needs stable keys so reschedules update the
-- pending reminders instead of leaving stale customer or merchant notifications.

alter table public.reservation_notification_outbox
  add column if not exists dedupe_key text;

alter table public.reservation_notification_outbox
  drop constraint if exists reservation_notification_outbox_dedupe_key_format,
  add constraint reservation_notification_outbox_dedupe_key_format
    check (dedupe_key is null or dedupe_key ~ '^[a-z0-9_:-]{6,160}$');

create unique index if not exists reservation_notification_outbox_dedupe_idx
  on public.reservation_notification_outbox (restaurant_id, dedupe_key);
