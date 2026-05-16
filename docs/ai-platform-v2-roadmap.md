# LogiVN AI Platform V2 Roadmap

## Current Baseline

LogiVN already has an AI-native foundation:

- Owner assistant: `/api/admin/ai/assistant`
- Customer assistant: `/api/ai/customer-assistant`
- Prompt router with Vietnamese F&B intents
- Qwen/xAI provider router and fallback attempts
- Tool calling for sales, peak hour, menu, payment, campaign and combo flows
- AI memory with `ai_conversations` and `ai_messages`
- AI usage/quota logging through billing entitlement
- Command Deck UI that turns answers into actions

The V2 goal is to move from "assistant that answers" to "AI operating layer that detects, explains and routes daily restaurant work".

## Product Principles

- AI must read scoped restaurant data before giving operational advice.
- AI output should become cards, actions and workflows, not long prose.
- Deterministic business signals should exist before LLM interpretation.
- Sensitive operations require owner confirmation.
- Payment confirmation, deletion and plan changes remain manual-only.

## V2 Architecture

```txt
Dashboard / Customer UI
  -> Command Deck
  -> AI Action Queue
  -> Contextual AI Cards

AI Runtime
  -> Intent Router
  -> Operational Snapshot
  -> Deterministic Operation Insights
  -> Tool-Aware Chat
  -> Action Builder
  -> Memory + Usage Logs

Future AI Core
  -> Provider Gateway: OpenAI, Gemini, Claude, Qwen, local-ready
  -> Cost Router
  -> Distributed Cache
  -> Embeddings + Retrieval
  -> Automation Rules
  -> Forecasting Jobs
```

## P0: Operation Assistant Core

Status: started.

Implemented first slice:

- `lib/ai/operation-insights.ts`
- Deterministic health score
- Payment risk insight
- Revenue empty-day insight
- Delayed service insight
- Peak-hour/staffing signal
- Menu upsell signal
- QR/table readiness signal
- Promotion opportunity signal
- Injected into owner AI snapshot and prompt digest
- Converted primary insight into an owner action prompt
- Dashboard `AI Ops Radar` cards for the top operational insights
- Persisted insight lifecycle table: `ai_operation_insights`
- Graceful fallback when the AI insight table has not been migrated yet
- Admin-only dismiss/resolved flow for noisy, stale or already handled dashboard insight cards
- Inventory-aware AI Ops signals: low stock, recipe coverage, expiring batches and open warehouse alerts
- Owner assistant intent coverage for Kho hàng / inventory questions
- Cost-free AI Ops cron endpoint: `/api/cron/ai-ops`
- Manual cron slicing via `intent` query for focused AI Ops refreshes
- Platform Admin cron visibility for AI Ops readiness and guard checks
- Shared `cron_run_logs` observability for reports, AI Ops, reservations and subscription lifecycle jobs
- Platform Admin cron operations show next-run ETA, last-run age, failure streak and recent execution history

Next implementation steps:

- Add owner notification delivery for daily morning summary
- Add branch-scoped insights using `branch_id` and `scope_key`
- Add food cost, waste and purchase order automation signals

## P1: Provider Gateway

Target:

- Keep Qwen as fast/default model where it works well.
- Add OpenAI as primary premium reasoning provider.
- Add Gemini/Claude as future providers behind the same contract.

Required work:

- Extend `AiProvider` beyond `qwen | xai`
- Split provider adapters by protocol instead of provider name
- Track estimated cost by model
- Add provider health and failover metrics
- Add env readiness checks in platform admin

## P1: Analytics And Recommendation Engine

Target:

- Explain revenue changes
- Detect weak hours, weak items and service bottlenecks
- Recommend combo, upsell, promotion and staffing actions

Required work:

- Add normalized analytical snapshot tables or materialized views
- Add `ai_recommendations`
- Add item affinity calculation from order items
- Add repeat-customer and reorder signals
- Add branch comparison for multi-branch restaurants

## P2: Automation Workflows

Target:

AI suggests workflows first, then owner confirms execution.

Examples:

- Low revenue in quiet hours -> draft promotion
- Repeated delayed orders -> staff/bếp alert
- Payment waiting too long -> payment guard alert
- Best seller spike -> upsell combo suggestion

Required work:

- `ai_automation_rules`
- `ai_automation_runs`
- rule evaluator service
- approval checkpoint integration
- audit trail for every workflow run

## P3: Memory And Retrieval

Target:

- Restaurant-aware memory without leaking tenant data
- Retrieval for menu, policies, reports and support answers
- Future vector search for documents and SOPs

Required work:

- Add embeddings provider abstraction
- Add document chunks scoped by `restaurant_id`
- Add retention rules and PII filters
- Add owner-visible memory controls

## Security Requirements

- Always scope data by `restaurant_id`.
- Customer AI must only see public/customer session data.
- Owner AI requires dashboard session and feature entitlement.
- AI action execution must pass normal API authorization.
- Raw tool output must never render in UI.
- All model failures should fall back to deterministic action routing.

## Immediate Build Order

1. Connect resolved insight actions to workflow checkpoints.
2. Add notification/email delivery for AI Ops morning summary.
3. Add OpenAI provider adapter for premium analytics.
4. Add recommendation records for combo/upsell/promotion.
5. Add automation rules with owner confirmation.
