-- Merchant/staff Telegram connect links are persistent invites.
-- They remain valid until consumed by /start or explicitly revoked from the Dashboard.
-- Plain token values are never stored; only token_hash is persisted.

update public.telegram_connection_tokens
set
  expires_at = '2126-01-01T00:00:00Z'::timestamptz,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'persistent', true,
    'expiresPolicy', 'until_revoked_or_consumed',
    'policyUpdatedAt', now()
  )
where consumed_at is null
  and revoked_at is null
  and expires_at < '2126-01-01T00:00:00Z'::timestamptz;

insert into public.telegram_audit_logs (action, outcome, metadata)
values (
  'telegram.connect_links_persistent',
  'accepted',
  jsonb_build_object('expiresAt', '2126-01-01T00:00:00Z', 'policy', 'until_revoked_or_consumed')
);
