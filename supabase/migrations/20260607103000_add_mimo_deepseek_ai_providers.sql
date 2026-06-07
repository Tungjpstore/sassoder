alter table public.platform_ai_provider_configs
  drop constraint if exists platform_ai_provider_configs_provider_check;

alter table public.platform_ai_provider_configs
  add constraint platform_ai_provider_configs_provider_check check (
    provider in ('mimo', 'deepseek', 'qwen', 'nvidia', 'bedrock', 'openai', 'gemini', 'xai', 'claude', 'vercel_gateway')
  );

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration',
  'platform_ai_provider_configs_mimo_deepseek_added',
  'platform_ai_provider_config',
  jsonb_build_object(
    'primary_provider', 'mimo',
    'fallback_order', jsonb_build_array('mimo', 'deepseek', 'gemini'),
    'mimo_env_names', jsonb_build_array('MIMO_API_KEY', 'MIMO_BASE_URL', 'MIMO_MODEL'),
    'mimo_default_model', 'mimo-v2.5-pro',
    'mimo_monthly_token_plan', 4000000000,
    'deepseek_env_names', jsonb_build_array('DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL')
  )
)
on conflict do nothing;
