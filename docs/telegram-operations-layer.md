# Telegram Operations Layer

## What Changed

Telegram is now wired as an operational event consumer, not a dashboard-only setup tool.

Business services emit tenant-scoped operational events to the VPS gateway. The gateway records the event, routes it through BullMQ, and the Telegram worker fans out compact action cards to connected owners/staff with branch and permission filtering.

The LogiVN DevOps bot is a separate runtime. It consumes platform events through its own queue and tables, so internal developer/support controls never share tenant Telegram sessions or callback state.

## Covered Event Surface

- Orders: `order.created`, `order.confirmed`, `order.completed`, `order.cancelled`, `order.delivery_status_changed`
- Payments: `payment.waiting_confirm`, `payment.received`
- Reservations: `reservation.created`, `reservation.deposit_submitted`, `reservation.confirmed`, `reservation.rejected`, `reservation.cancelled`, `reservation.checked_in`, `reservation.seated`, `reservation.no_show`, `reservation.rescheduled`
- Service requests: `service_request.created`, `service_request.resolved`
- Staff approvals: `staff.request_created`, `staff.request_reviewed`
- Menu and attendance: `menu.item_availability_suggested`, `staff.checked_in`
- Existing tenant ops alerts: `inventory.low`, `sla.warning`
- Platform DevOps alerts: `platform.alert` routed to `platform.telegram.notifications`

## Reliability Upgrade

Operational events are now first written to `operational_event_outbox`. If the internal gateway, Redis, BullMQ, or Telegram worker is unavailable, the VPS worker process reclaims due events through `claim_operational_event_outbox()` and republishes them to BullMQ.

This preserves the fast customer/admin request path while making Telegram delivery replayable. Old app versions can continue running during the migration because outbox writes degrade to logging when the table has not been applied yet.

Platform alerts can be emitted without `restaurantId`; they are normalized to `tenantId=platform` and routed only to `platform-telegram-bot`.

## Action Rules

- `order.created`: confirm, cancel, view
- `order.confirmed`: mark done, view
- `order.delivery_status_changed`: accept delivery, out for delivery, delivered, reject delivery where the current delivery state allows it
- `payment.waiting_confirm`: confirm, amount mismatch, view
- `reservation.created`: reject, view
- `reservation.deposit_submitted`: confirm deposit, reject, view
- `service_request.created`: resolve, view
- `staff.request_created`: approve, reject, view

Every mutation still flows through signed Telegram callback tokens, one-time database claims, connection matching, branch scope checks, and live staff permission validation in the internal Next.js action API.

## Bot UX

`/menu` now opens a compact role-aware operations center:

- Hôm nay
- Đơn nóng
- Thanh toán
- Đặt bàn
- Nhân sự
- Menu
- AI Ops
- Brief
- Sự cố

`/ops` opens the live board for the connected restaurant/branch. It shows open orders, pending confirmations, late SLA count, waiting VietQR, delivery workload, reservation workload, service calls, staff approvals, and Telegram delivery health. The board is refreshable through signed session callbacks instead of unsigned callback data.

`/brief` reads recent Telegram-originated AI Ops summaries from `telegram_owner_briefings`. Each `/doanhthu`, `/tinhhinh`, `/tonkho`, or free-text AI Ops request persists a branch-aware briefing with provider/model, compact summary, and top safe actions. This keeps owner context available after the Telegram chat scrolls away and gives support a durable audit trail.

`/suco` reads open incidents from `telegram_ops_incidents`, including delivery failures, payment mismatch flags, and AI Ops failures. The bot keeps this compact and action-first: refresh, open the ops board, or jump to the dashboard notification settings.

## DevOps Bot UX

The DevOps bot uses `/menu`, `/health`, `/backup`, `/queues`, `/webhook`, and `/incidents` for internal operations only. Its cards are compact and button-first:

- Health: gateway, socket, AI, image, worker, and tenant Telegram health
- Backup: short RPO/status card, manual backup queue action with signed confirmation, and an on-demand detail card for artifacts, restore tests, and open alerts
- Queues: top BullMQ backlog and failed/DLQ counts, including `platform.telegram.notifications`
- Webhook: Telegram webhook status without exposing the webhook secret
- Incidents: failed queues and platform alerts

Access is normally connected from `admin.logivn.com/ops` with the DevOps Telegram Command Center. That surface creates one-time signed `/start` tokens, stores only hashes in `platform_telegram_connection_tokens`, shows active/revoked connections, token lifecycle, recent security audit logs, and lets a platform admin revoke stale tokens or Telegram accounts without touching the database. `PLATFORM_TELEGRAM_ALLOWED_USER_IDS` and `/start <PLATFORM_TELEGRAM_BOOTSTRAP_TOKEN>` remain emergency bootstrap paths only. Every inline button uses a one-time signed session stored in `platform_telegram_sessions`, and every callback re-checks the Telegram user, connection status, scope, expiry, and replay state.

DevOps users can also self-audit directly inside Telegram:

- `/whoami` shows the mapped Telegram account, role, and compact scope list.
- `/security` shows recent accepted/denied/sent audit events for that Telegram account.
- `/disconnect` revokes the current Telegram account through a signed confirmation callback, requiring a fresh `admin.logivn.com/ops` link to reconnect.

## Automation

The VPS worker starts two automation loops by default:

- Operational outbox relay: `OPERATIONAL_OUTBOX_RELAY_ENABLED`, `OPERATIONAL_OUTBOX_RELAY_INTERVAL_MS`, `OPERATIONAL_OUTBOX_RELAY_BATCH_SIZE`, `OPERATIONAL_OUTBOX_RELAY_MAX_ATTEMPTS`
- Order SLA scanner: `ORDERS_SLA_SCANNER_ENABLED`, `ORDERS_SLA_SCANNER_INTERVAL_MS`, `ORDERS_SLA_WARNING_MINUTES`, `ORDERS_SLA_WARNING_REPEAT_MINUTES`

The SLA scanner emits deduped `sla.warning` events by order and lateness bucket, so Telegram can escalate overdue orders without depending on dashboard traffic.

## Next Upgrade Path

1. Add courier assignment cards for nearest courier allocation and handoff notes.
2. Add richer staff workspace cards for kitchen tasks, cleaning tasks, urgent table tasks, and attendance QR fallback.
3. Add Sentry/Better Stack/Alertmanager adapters that publish `platform.alert` directly into the gateway with severity routing.
4. Add dashboard-editable automation rules: "if VietQR waiting 5 minutes", "if reservation deposit not paid before hold expiry".
5. Add per-tenant delivery analytics: sent/skipped/failed latency by event type and role.

## Release Notes

New event types are backward compatible. If the gateway has not been deployed yet, Next.js publish calls degrade to a logged `gateway_rejected` result instead of blocking customer/order requests. Deploy order should still be:

1. VPS shared/gateway/telegram services.
2. Configure tenant Telegram webhook if secrets changed.
3. Configure Platform Telegram webhook if `PLATFORM_TELEGRAM_*` secrets changed.
4. Vercel production deployment.
5. Telegram smoke tests from Dashboard and `scripts/infra/telegram-production-smoke.mjs`.
