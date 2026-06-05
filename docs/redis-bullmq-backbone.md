# LogiVN Redis + BullMQ Backbone

Redis on the VPS is the operational realtime backbone for queues, retries, locks, rate limits, realtime state, cache, Socket.IO fan-out, and worker coordination. Supabase remains the source of truth.

## Runtime Topology

```txt
Vercel Next.js
  -> VPS gateway /events, /queues/jobs, /locks/*
  -> Redis 7 AOF on private Docker network
  -> BullMQ domain workers
  -> Telegram bot, AI jobs, realtime broadcasts, operational notifications
```

The first production phase runs one Redis instance on the current 4 vCPU / 8GB VPS. Redis has no public port mapping. App services reach it only on the private `logivn-internal` Docker network with `requirepass`.

## Redis Configuration

`infra/vps/redis/redis.conf` enables AOF, `appendfsync everysec`, snapshots, `maxmemory 1gb`, `noeviction`, slowlog visibility, and destructive command removal. `noeviction` is intentional for BullMQ: when Redis reaches the memory ceiling, producers fail fast instead of silently evicting queue, lock, or stream keys.

Docker binds Redis to the internal container network and publishes no host port. For a non-Docker host install, use `bind 127.0.0.1` with the same protected mode, password, AOF, and memory policy.

## Queue Inventory

- Notifications: `telegram.notifications`, `push.notifications`, `email.notifications`
- Orders: `orders.processing`, `orders.sla`, `orders.retry`
- Payments: `payments.confirmation`, `payments.retry`, `payments.reconciliation`
- AI: `ai.analytics`, `ai.summary`, `ai.reports`, `ai.chat`
- Reservation: `reservation.reminders`, `reservation.expiry`, `reservation.confirmation`
- Inventory: `inventory.sync`, `inventory.alerts`
- Staff: `staff.attendance`, `staff.notifications`, `staff.requests`

Every queue has attempts, exponential backoff, priority, retention, processing timeout, and a corresponding `<queue>.dlq` dead-letter queue.

`telegram.notifications` uses a custom BullMQ backoff strategy that honors Telegram
`429 retry_after` responses when grammY exposes them. Other queues use exponential
backoff based on their domain configuration.

Priority labels map to BullMQ numeric priority: `critical=1`, `high=5`, `normal=10`, `low=50`, `background=100`.

## Event Routing

`POST /events` is the preferred ingress for operational flows. Events must include `eventId` and either `tenantId` or `restaurantId`.

- `order.created` -> `orders.processing`, `telegram.notifications`
- `order.confirmed` -> `orders.processing`, `telegram.notifications`
- `order.completed` -> `orders.processing`, `telegram.notifications`
- `order.cancelled` -> `orders.processing`, `telegram.notifications`
- `order.delivery_status_changed` -> `orders.processing`, `telegram.notifications`
- `payment.received` -> `payments.confirmation`, `telegram.notifications`
- `payment.waiting_confirm` -> `payments.confirmation`, `telegram.notifications`
- `reservation.created` -> `reservation.confirmation`, `telegram.notifications`
- `reservation.deposit_submitted` -> `reservation.confirmation`, `telegram.notifications`
- `reservation.confirmed` -> `reservation.confirmation`, `telegram.notifications`
- `reservation.rejected` -> `reservation.confirmation`, `telegram.notifications`
- `reservation.cancelled` -> `reservation.confirmation`, `telegram.notifications`
- `reservation.checked_in` -> `reservation.confirmation`, `telegram.notifications`
- `reservation.seated` -> `reservation.confirmation`, `telegram.notifications`
- `reservation.no_show` -> `reservation.confirmation`, `telegram.notifications`
- `reservation.rescheduled` -> `reservation.confirmation`, `telegram.notifications`
- `inventory.low` -> `inventory.alerts`, `telegram.notifications`
- `staff.checked_in` -> `staff.attendance`, `staff.notifications`
- `service_request.created` -> `staff.requests`, `telegram.notifications`
- `service_request.resolved` -> `staff.requests`, `telegram.notifications`
- `platform.alert` -> `telegram.notifications`
- `sla.warning` -> `orders.sla`, `telegram.notifications`

The legacy Telegram producer now publishes to `/events`, so notification fan-out is event-driven instead of direct service coupling.

Admin-triggered Telegram retry is the one intentional exception to normal event
ingress: the Dashboard calls `/queues/jobs` for a failed `telegram_notifications`
record so operators can requeue exactly the stored event payload. The retry job
gets a fresh retry job id, while the payload keeps the original `eventId` so
`telegram_notifications` remains idempotent per connection.

Each accepted event is also appended to Redis Streams:

```txt
events:operational
tenant:{id}:events
```

Use `GET /events/recent` with the internal key for operational triage.

## Worker Architecture

Domain workers live in `infra/vps/services/workers/`: notification, order, payment, AI, reservation, inventory, and staff. `workers/index.mts` boots them and exposes `/ready`, `/queues`, `/queues/failed`, and `/redis`.

Telegram remains isolated in `telegram-bot/server.mts` because it owns grammY webhook handling, callback authorization, Telegram rate limits, and notification audit state.

Telegram callbacks are signed and single-use. The worker stores callback action
rows with token hash, expiry, connection id, resource type/id, branch scope, and
required permission. On click, the bot verifies signature, expiry, replay status,
connected Telegram account, connection match, branch scope, and permission before
calling the app internal action API.

Revoking a Telegram connection from Dashboard marks the connection `revoked` and
updates pending callback actions for that connection to `revoked`, closing the
loop between staff access changes and old Telegram inline buttons.

When a Telegram account has multiple active tenant connections, AI Ops commands
create short-lived `telegram_sessions` rows and render a signed one-time tenant
picker. Claiming the picker verifies the token, expiry, active connection, and
Telegram user before executing the pending AI request.

Telegram ingress also uses Redis rate-limit keys before expensive work:

- `tenant:telegram:rate-limit:connect:{telegramUserId}` protects connect token attempts
- `tenant:telegram:rate-limit:callback:{telegramUserId}` protects inline callback bursts
- `tenant:telegram:rate-limit:ai-ops:{telegramUserId}` protects AI Ops command/chat cost

## Tenant Safety

Queue jobs are rejected unless they include `tenantId` or `restaurantId`. Redis operational keys use:

```txt
tenant:{id}:cache:{scope}:{key}
tenant:{id}:rate-limit:{scope}:{identifier}
tenant:{id}:realtime:{scope}:{identifier}
lock:tenant:{id}:{scope}:{resourceId}
```

## Locks, Rate Limits, State

Internal gateway endpoints:

- `POST /locks/acquire`
- `POST /locks/release`
- `GET /queues`
- `GET /queues/failed`
- `POST /queues/jobs`
- `POST /rate-limits/check`
- `POST /realtime/state`
- `GET /realtime/state`
- `GET /redis/health`

Payment confirmation in the Next.js admin route now takes a Redis lock through the VPS gateway before applying the state transition.

The Dashboard Telegram Ops panel uses `GET /queues` and `GET /queues/failed` to
show `telegram.notifications` backlog, failed jobs, and
`telegram.notifications.dlq` counts beside the Supabase delivery/audit records.

## Monitoring And Backup

Prometheus scrapes app service `/metrics`, `redis-exporter:9121`, node exporter, and cAdvisor. Grafana provisions the Prometheus datasource and the `LogiVN Redis + BullMQ Operations` dashboard from `infra/vps/monitoring/grafana/`, covering Redis memory/AOF health, queue depth, DLQs, oldest waiting job age, worker success/failure rates, worker latency, Telegram delivery metrics, and scrape target status.

RedisInsight is bound to `127.0.0.1:5540` for SSH-tunneled inspection. Bull Board is mounted by the gateway at `/queues/board` only when `BULL_BOARD_ENABLED=true`; it requires `BULL_BOARD_USERNAME` and `BULL_BOARD_PASSWORD`, and Nginx exposes it under `monitor.logivn.com/queues/board/` behind the monitoring htpasswd gate.

Prometheus alert rules live in `infra/vps/monitoring/alerts.yml` and cover Redis memory/AOF/exporter health, queue backlog, worker death, retry spikes, payment DLQ failures, and notification delay. Alertmanager posts internally to `gateway:3100/alerts`; the gateway routes those alerts to the internal Dev Telegram bot through `platform.telegram.notifications`. `ALERT_WEBHOOK_FORWARD_URL` remains an optional extra forwarder for Better Stack, Slack, or another incident webhook.

VPS container images are pinned to explicit version tags in `infra/vps/docker-compose.yml`, and `npm run infra:check` rejects `latest`, major-only, or minor-only tags. Do not reintroduce dynamic tags for Redis, Grafana, Prometheus, Alertmanager, RedisInsight, Uptime Kuma, node-exporter, or cAdvisor; upgrades should be deliberate and validated with the monitoring smoke script.

`infra/vps/scripts/backup.sh` triggers `BGSAVE` and `BGREWRITEAOF`, then archives the Redis Docker volume.
`infra/vps/scripts/restore-redis-backup.sh --dry-run <backup.tgz>` verifies that a backup contains restorable Redis data. A real restore requires `CONFIRM_RESTORE=restore-logivn-redis`, stops Redis-dependent services, creates a pre-restore volume backup, replaces the Redis volume contents, restarts services, and runs local validation.

`infra/vps/scripts/production-readiness.sh` is the post-deploy gate for the backbone. It verifies env readiness, local service health, Redis AOF/noeviction/maxmemory, gateway event/queue/lock/rate-limit/realtime flows, Bull Board auth when enabled, Prometheus/Alertmanager config, Grafana provisioning, Prometheus scrape targets, latest backup restorability, and public HTTPS endpoints.

## Scale Roadmap

- Phase 1: single Redis on current VPS, AOF, private Docker network, domain workers.
- Phase 2: tune dedicated worker processes and per-domain concurrency.
- Phase 3: move Redis to a dedicated VPS when memory or queue latency becomes the bottleneck.
- Phase 4: add Sentinel or Cluster only after measured failover or throughput pressure justifies it.
