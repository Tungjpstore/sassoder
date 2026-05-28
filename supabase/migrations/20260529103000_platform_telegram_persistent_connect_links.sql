-- Platform DevOps Telegram connect links are persistent invites.
-- They remain valid until an admin revokes the token or the token is consumed
-- by Telegram /start. Plain token values are never stored in Postgres.

update public.platform_telegram_connection_tokens
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

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration',
  'platform_telegram_connect_links_persistent',
  'platform_telegram_connection_token',
  jsonb_build_object('expiresAt', '2126-01-01T00:00:00Z', 'policy', 'until_revoked_or_consumed')
);
