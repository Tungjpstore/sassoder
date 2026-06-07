# Xiaomi MiMo AI Migration Runbook

## Scope

Luồng AI cũ dùng Qwen/DashScope đã được chuyển sang Xiaomi MiMo API nhưng giữ nguyên endpoint routing, task mapping, prompt và response parser hiện tại.

Provider chính là `mimo` với model mạnh nhất `mimo-v2.5-pro`. Fallback mặc định là `deepseek`, rồi `gemini`.

Các task hiện hữu vẫn đi qua cùng surface:

| Task hiện có | Internal task/router | Primary model | Fallback |
| --- | --- | --- | --- |
| Chatbot Telegram / customer assistant | `customer_ordering`, `dashboard_operation`, `tool` | `mimo-v2.5-pro` | DeepSeek, Gemini Flash |
| SummarizeOrder | `dashboard_operation`, `tool` | `mimo-v2.5-pro` | DeepSeek, Gemini Flash |
| WeeklyReport / MonthlyReport | `analytics_reasoning`, `batch_report` | `mimo-v2.5-pro` | DeepSeek, Gemini Flash |
| MenuSuggestion / Branding / OCR menu | `menu_generation`, `branding`, `ocr` | `mimo-v2.5-pro` | DeepSeek/Gemini for text, Gemini/OpenAI for OCR fallback in router |
| AdminAssistant / AI assistant vận hành | `dashboard_operation`, `business_insight`, `tool` | `mimo-v2.5-pro` | DeepSeek, Gemini Flash |

Qwen provider configs are retained only as legacy admin records. Runtime aliases `qwen` and `dashscope` to `mimo`, and the AI router does not auto-route to Qwen.

## Environment Setup

Local `.env.local` is gitignored. Configure secrets there for local testing, and configure the same keys in Vercel/VPS secret management for production.

```bash
MIMO_API_KEY="tp-..."
MIMO_BASE_URL="https://token-plan-sgp.xiaomimimo.com/v1"
MIMO_MODEL="mimo-v2.5-pro"
MIMO_CHAT_MODEL="mimo-v2.5-pro"
MIMO_FAST_MODEL="mimo-v2.5-pro"
MIMO_OCR_MODEL="mimo-v2.5-pro"
COPILOTKIT_PROVIDER="mimo"
COPILOTKIT_MODEL="mimo-v2.5-pro"
COPILOTKIT_MIMO_MODEL="mimo-v2.5-pro"
AI_OWNER_PROVIDER="mimo"
AI_CUSTOMER_PROVIDER="mimo"
AI_PROVIDER_FALLBACK_ORDER="mimo,deepseek,gemini"
```

MiMo Token Plan may show a region-specific Base URL in the MiMo console. If the subscription page shows a different region, replace `MIMO_BASE_URL` with that exact OpenAI-compatible URL.

Fallback keys:

```bash
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
DEEPSEEK_MODEL="deepseek-chat"
DEEPSEEK_CHAT_MODEL="deepseek-chat"
DEEPSEEK_FAST_MODEL="deepseek-chat"

GEMINI_API_KEY=""
GEMINI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_CHAT_MODEL="gemini-2.5-flash"
GEMINI_FAST_MODEL="gemini-2.5-flash"
```

VPS services use the same env names through `infra/vps/docker-compose.yml`.

## Token Plan Guardrails

The monthly MiMo package is configured as 4,000,000,000 tokens. The default daily guard is monthly quota divided by 30:

```bash
MIMO_MAX_MONTHLY_TOKENS="4000000000"
MIMO_MAX_DAILY_TOKENS="133333333"
MIMO_DAILY_TOKEN_GUARD_ENABLED="true"
```

Task-specific daily token caps can be tuned by env:

```bash
MIMO_DAILY_TOKENS_CUSTOMER_ORDERING="21333333"
MIMO_DAILY_TOKENS_DASHBOARD_OPERATION="21333333"
MIMO_DAILY_TOKENS_ANALYTICS_REASONING="16000000"
MIMO_DAILY_TOKENS_BATCH_REPORT="18666666"
MIMO_DAILY_TOKENS_MENU_GENERATION="9333333"
MIMO_DAILY_TOKENS_OCR="10666666"
```

If MiMo hits the daily task cap, times out, returns 429, or returns a 5xx provider error, the router records the failed attempt and continues to DeepSeek/Gemini without changing endpoint mapping.

## Pro/Premium Quotas

Billing request quotas remain unchanged. MiMo token caps are provider-side guardrails and do not replace plan entitlements.

| Plan | Price | Existing AI quotas |
| --- | ---: | --- |
| Pro | 99k/month | `ai_chatbot`: 500/month, `ai_menu_generation`: 60/month, trial-only image/analytics/branding |
| Premium | 199k/month | `ai_chatbot`: 5000/month, `ai_menu_generation`: 300/month, `ai_image_generation`: 120/month, `ai_analytics`: 120/month, `ai_marketing`: 150/month, `ai_branding`: 60/month, `ai_automation`: 300/month, `advanced_ai_assistant`: 2000/month |

Usage continues to write:

- `ai_usage_logs` for provider/model/status/input/output tokens, `providerAttempts`, latency, cost estimate, and `taskType`.
- `usage_quotas` for `ai_requests`, `ai_images`, and non-counting `ai_tokens` ledger rows.

## Monitoring

Operational checks:

1. `app/dashboard/ai-control` should show `Xiaomi MiMo` configured.
2. `providerAttempts` in `ai_usage_logs.metadata` should start with `mimo` and include fallback attempts only when MiMo fails or is over task token budget.
3. Token monitoring should group rows where `provider = 'mimo'` and `metadata->>'taskType'` matches the task.
4. Platform audit logs preserve historical Qwen rows and record the provider schema migration that added MiMo/DeepSeek.

Suggested SQL checks:

```sql
select provider, model, status, count(*) as requests,
       sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)) as tokens
from public.ai_usage_logs
where created_at >= now() - interval '1 day'
group by provider, model, status
order by requests desc;
```

```sql
select metadata->>'taskType' as task_type,
       sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)) as tokens
from public.ai_usage_logs
where provider = 'mimo'
  and created_at >= date_trunc('day', now())
group by metadata->>'taskType'
order by tokens desc;
```

## Test Cases

Run these after setting env:

```bash
npm test -- lib/ai/router/provider-routing.test.ts lib/ai/ai-security-hardening-source.test.ts services/platform-ai-provider-config-service.test.ts
npm run lint
```

Manual smoke checklist:

1. Customer chatbot asks menu/order question and `ai_usage_logs.provider = 'mimo'`.
2. Admin assistant asks an operational question and response includes normal action payloads.
3. Menu OCR from image returns the same JSON draft shape as before.
4. Weekly/monthly report generation logs `taskType = 'analytics_reasoning'` or `batch_report`.
5. Temporarily set `MIMO_DAILY_TOKEN_GUARD_ENABLED=true` and a tiny `MIMO_DAILY_TOKENS_DASHBOARD_OPERATION`; confirm router falls back to DeepSeek/Gemini and logs failed `mimo` attempt.

## Secret Handling

Do not commit API keys. Use `.env.local`, Vercel encrypted env vars, VPS `.env`, or the admin AI provider config UI. The admin UI encrypts provider keys server-side using `PLATFORM_AI_SECRET_KEY` and stores only ciphertext/fingerprint metadata.
