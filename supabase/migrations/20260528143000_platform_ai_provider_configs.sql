-- Admin-managed AI provider keys and runtime model overrides.
-- Raw API keys are encrypted by the Next.js server before storage; this table
-- intentionally keeps only ciphertext, fingerprint and audit metadata.

create table if not exists public.platform_ai_provider_configs (
  provider text primary key,
  enabled boolean not null default true,
  api_key_ciphertext text,
  api_key_iv text,
  api_key_tag text,
  key_fingerprint text,
  key_last_four text,
  base_url text,
  chat_model text,
  fast_model text,
  image_model text,
  ocr_model text,
  last_rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint platform_ai_provider_configs_provider_check check (
    provider in ('qwen', 'nvidia', 'openai', 'gemini', 'xai', 'claude', 'vercel_gateway')
  ),
  constraint platform_ai_provider_configs_key_bundle_check check (
    (
      api_key_ciphertext is null
      and api_key_iv is null
      and api_key_tag is null
      and key_fingerprint is null
      and key_last_four is null
    )
    or (
      api_key_ciphertext is not null
      and api_key_iv is not null
      and api_key_tag is not null
      and key_fingerprint is not null
      and key_last_four is not null
    )
  )
);

create index if not exists platform_ai_provider_configs_updated_idx
  on public.platform_ai_provider_configs (updated_at desc);

alter table public.platform_ai_provider_configs enable row level security;

revoke all on table public.platform_ai_provider_configs from anon;
revoke all on table public.platform_ai_provider_configs from authenticated;
grant all on table public.platform_ai_provider_configs to service_role;

drop trigger if exists platform_ai_provider_configs_set_updated_at on public.platform_ai_provider_configs;
create trigger platform_ai_provider_configs_set_updated_at
before update on public.platform_ai_provider_configs
for each row execute function public.set_updated_at();

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration',
  'platform_ai_provider_configs_created',
  'platform_ai_provider_config',
  jsonb_build_object(
    'providers', jsonb_build_array('qwen', 'nvidia', 'openai', 'gemini', 'xai', 'claude', 'vercel_gateway'),
    'secretPolicy', 'server-encrypted-at-rest-no-raw-key-in-ui'
  )
);
