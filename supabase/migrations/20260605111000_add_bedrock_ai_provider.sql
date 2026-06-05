alter table public.platform_ai_provider_configs
  drop constraint if exists platform_ai_provider_configs_provider_check;

alter table public.platform_ai_provider_configs
  add constraint platform_ai_provider_configs_provider_check check (
    provider in ('qwen', 'nvidia', 'bedrock', 'openai', 'gemini', 'xai', 'claude', 'vercel_gateway')
  );

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration',
  'platform_ai_provider_configs_bedrock_added',
  'platform_ai_provider_config',
  jsonb_build_object(
    'provider', 'bedrock',
    'env_names', jsonb_build_array('AWS_BEARER_TOKEN_BEDROCK', 'BEDROCK_API_KEY'),
    'default_model', 'us.amazon.nova-2-lite-v1:0'
  )
)
on conflict do nothing;
