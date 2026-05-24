# NVIDIA DSX Air Batch Integration

DSX Air is wired as a background AI compute provider for LogiVN. It is not used as the primary app host, database, or default realtime customer chat provider.

## Environment

Configure these server-side env vars in production:

```bash
NVIDIA_AI_API_KEY=""
NVIDIA_AI_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_AI_CHAT_MODEL="meta/llama-3.1-70b-instruct"
NVIDIA_AI_FAST_MODEL="meta/llama-3.1-8b-instruct"
NVIDIA_AI_BATCH_ENABLED="true"
NVIDIA_AI_BATCH_PROVIDER="nvidia"
```

Aliases are also supported for DSX Air workspaces:

```bash
DSX_AIR_API_KEY=""
DSX_AIR_BASE_URL=""
DSX_AIR_MODEL=""
DSX_AIR_BATCH_ENABLED="true"
DSX_AIR_BATCH_PROVIDER="nvidia"
```

## Cron Usage

The existing `/api/cron/ai-ops` route can run DSX Air batch jobs when `NVIDIA_AI_BATCH_ENABLED=true`.

Manual smoke examples:

```bash
curl "$APP_URL/api/cron/ai-ops?limit=1&dsxBatch=true&dsxJobs=operations_report,inventory_analysis,marketing_seo" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Supported jobs:

- `operations_report`
- `inventory_analysis`
- `marketing_seo`
- `memory_brief`

Batch outputs are persisted to `ai_batch_compute_runs`. If the migration is not applied yet, the cron reports `schemaMissing` and continues without blocking normal AI Ops.
