-- Rotatable access tokens for table QR links.
-- Existing QR links stay valid until a table QR is explicitly rotated.

alter table public.tables
  add column if not exists qr_token_version integer not null default 1,
  add column if not exists qr_token_enforced boolean not null default false,
  add column if not exists qr_token_rotated_at timestamptz;

alter table public.tables
  drop constraint if exists tables_qr_token_version_positive,
  add constraint tables_qr_token_version_positive check (qr_token_version >= 1);

create index if not exists tables_restaurant_qr_enforced_idx
  on public.tables (restaurant_id, qr_token_enforced, qr_enabled);
