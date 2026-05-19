# LogiVN Admin Mission Control

This document describes the `/admin` control-plane direction after the first Mission Control pass.

## Scope

`/admin` is the internal LogiVN platform control plane. It is separate from restaurant owner/staff dashboard APIs under `app/api/admin/*`.

The current Mission Control scope is:

- Observe platform health across tenants, billing, content, AI, maps, integrations, cron, and deployment runtime.
- Keep secret handling safe by showing only configured/missing state and environment variable names.
- Preserve tenant privacy by avoiding private order/revenue drilldown from platform admin.
- Prefer read-only observability first, then add write actions behind permissions, audit, confirmation, and rollback.

## Implemented Surfaces

- `/admin/content` tracks landing, pricing, blog, customer QR menu, sitemap/feed/llms surfaces.
- `/admin/ai` tracks AI routing, provider readiness, 24h usage, tokens, failures, and model names.
- `/admin/ai` tracks AI Ops Morning Brief generation, email delivery status, health scores, recent failed/skipped deliveries, severity counts, recipients, summaries, and top action items.
- `/admin/ai` tracks branch-scoped AI Ops insights across restaurants, including open count, critical/warning split, affected branch count, latest signal time, and recent action items without exposing private order/revenue drilldown.
- `/admin/maps` tracks map provider calls, failures, estimated cost, cache hit rate, delivery quote acceptance, and routing fallback config.
- `/admin/atlas` maps the full project surface across frontend, backend, data, automation, and external integrations.
- `/admin/ops` tracks Vercel Cron jobs, next-run ETA, recent run history, failure streaks, integration readiness, cache readiness, and env/secret guardrails.
- `/admin/governance` tracks capability coverage, mutation risk, audit/rollback readiness, and RBAC role readiness.

## Safety Rules

- Do not store raw API keys in Supabase tables.
- Do not expose service-role, AI, map, email, R2, or cron secrets to the browser.
- Platform `/admin` mutations must go through server actions or server-only APIs.
- Every mutation must write an audit log with actor, action, target, metadata, timestamp, and reason where possible.
- Destructive tenant/content/billing actions should require explicit confirmation and, for production-critical changes, approval.
- High-risk mutations should be listed in the mutation registry before they become available to non-owner roles.
- Any support mode for tenant data must be reason-scoped, time-limited, read-only by default, and audit logged.

## Next Upgrade Sequence

1. Add `platform_admin_users`, roles, permissions, session revocation, and optional 2FA.
2. Add immutable `platform_content_revisions` for landing/pricing/blog with draft, preview, publish, and rollback.
3. Add synthetic checks for critical Atlas flows: QR order, checkout, reservation, dashboard login, billing, and cron.
4. Add `platform_change_requests` for approval on dangerous changes.
5. Extend platform-wide cron execution logs with push/email alerts and drill-down details per execution.
6. Add R2 migration plan for platform assets with dual-read fallback to Supabase Storage.

## Governance Model

The governance screen intentionally separates three concerns:

- Capability matrix: what `/admin` can observe, adjust, audit, and roll back.
- Mutation registry: which server actions are live, how they are guarded, and which actions are high risk.
- Role readiness: which future roles should exist before more people can operate production.

Current limitation: runtime `/admin` auth is still a single platform admin credential. Treat all logged-in platform admin sessions as owner-level until RBAC is implemented.
