-- Phase A (trust foundation): new tenants must require signed table QR tokens.
--
-- `tables.qr_token_enforced` already defaults to true for tables created through
-- services/table-service.ts, but `restaurants.allow_legacy_qr` still defaulted to
-- true, which keeps unsigned /r/<slug>/table/<id> links working for the whole
-- tenant and silently overrides per-table enforcement.
--
-- Forward-only and deliberately non-retroactive: existing tenants keep their
-- current value because their printed QR codes predate token enforcement and
-- flipping them here would break dine-in ordering at every table until the
-- owner reprints. Those tenants are migrated by rotating QR tokens from the
-- dashboard, not by this migration.

alter table public.restaurants
  alter column allow_legacy_qr set default false;

comment on column public.restaurants.allow_legacy_qr is
  'When true, unsigned legacy table QR links are accepted for this tenant. Defaults to false since 2026-09-05; existing tenants keep their stored value until they rotate QR codes.';
