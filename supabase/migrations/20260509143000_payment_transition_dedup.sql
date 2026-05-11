alter table public.payment_logs
  add column if not exists transition_key text;

create unique index if not exists payment_logs_transition_key_idx
  on public.payment_logs (transition_key)
  where transition_key is not null;

alter table public.reservation_deposit_logs
  add column if not exists transition_key text;

create unique index if not exists reservation_deposit_logs_transition_key_idx
  on public.reservation_deposit_logs (transition_key)
  where transition_key is not null;
