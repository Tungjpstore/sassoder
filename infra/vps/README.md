# LogiVN GreenCloud VPS Infrastructure

This folder contains the production backend layer for the LogiVN hybrid architecture.

Vercel remains the frontend/SSR platform. Supabase remains the primary PostgreSQL/Auth/Storage platform. The GreenCloud VPS runs realtime, queues, workers, AI orchestration, image/PDF processing, Telegram operations, Redis, and monitoring.

## Service Map

| Public host | Nginx upstream | Container | Purpose |
| --- | --- | --- | --- |
| `api.logivn.com` | `127.0.0.1:3100` | `gateway` | internal API gateway, queue enqueue, config, readiness |
| `ws.logivn.com` | `127.0.0.1:3200` | `socket` | Socket.IO realtime with Redis adapter |
| `worker.logivn.com` | `127.0.0.1:3500` | `worker` | BullMQ worker health and queue summary |
| `monitor.logivn.com` | `127.0.0.1:3001` | `uptime-kuma` | uptime dashboard |
| `monitor.logivn.com/grafana/` | `127.0.0.1:3002` | `grafana` | metrics dashboard |
| `monitor.logivn.com/queues/board/` | `127.0.0.1:3100` | `gateway` | BullMQ queue operations dashboard |

Internal-only services:

- `redis`: persistent Redis for BullMQ and Socket.IO fan-out
- `redis-exporter`: Redis memory, command, and persistence metrics for Prometheus
- `ai-service`: OpenAI/xAI/Qwen/Claude provider routing and async AI jobs
- `image-service`: image optimization and PDF invoice generation
- `telegram-bot`: grammY webhook and BullMQ Telegram operations worker
- `platform-telegram-bot`: separate grammY DevOps bot for LogiVN internal alerts, queue checks, and support operations
- `prometheus`, `node-exporter`, `cadvisor`: lightweight metrics collection
- `redisinsight`: Redis dashboard bound to `127.0.0.1:5540` for SSH-tunneled access
- `alertmanager`: Prometheus alert routing, bound to `127.0.0.1:9093`

## First VPS Bootstrap

Run on a fresh Ubuntu VPS as `root`:

```bash
export DEPLOY_PUBLIC_KEY="ssh-ed25519 ..."
curl -fsSL https://raw.githubusercontent.com/Tungjpstore/sassoder/main/infra/vps/scripts/bootstrap-vps.sh | bash
```

The script:

- updates apt packages
- installs curl, git, unzip, htop, ufw, fail2ban, build-essential
- sets timezone to `Asia/Ho_Chi_Minh`
- creates 2GB swap if none exists
- tunes Linux kernel settings for Redis AOF/BGSAVE stability and high connection backlogs
- installs Docker, Docker Compose, Node.js 22, pnpm, PM2, Nginx, Certbot
- installs PostgreSQL client tools for encrypted R2 backup and restore checks; the default R2 path uses the Cloudflare Worker gateway over `curl`, while S3-compatible tooling is optional future expansion
- enables UFW for SSH/HTTP/HTTPS
- configures fail2ban
- disables password SSH only when `DEPLOY_PUBLIC_KEY` is supplied
- creates `/opt/logivn` with the requested service folders

## Deploy

On the VPS:

```bash
cd /opt/logivn/app
cp infra/vps/.env.example /opt/logivn/.env
chmod 600 /opt/logivn/.env
```

Fill `/opt/logivn/.env`, then run:

```bash
infra/vps/scripts/doctor.sh
infra/vps/scripts/deploy.sh
infra/vps/scripts/issue-certs.sh
infra/vps/scripts/install-cron.sh
infra/vps/scripts/validate.sh
infra/vps/scripts/production-readiness.sh
```

## Required DNS

Point these records to the GreenCloud VPS public IPv4:

```txt
api.logivn.com      A <VPS_IP>
ws.logivn.com       A <VPS_IP>
worker.logivn.com   A <VPS_IP>
monitor.logivn.com  A <VPS_IP>
```

Keep `logivn.com`, `app.logivn.com`, and tenant wildcard records on Vercel unless the frontend routing strategy changes.

## GitHub Actions Secrets

Configure these repository secrets to enable auto deploy from `.github/workflows/vps-deploy.yml`:

```txt
VPS_HOST
VPS_SSH_KEY
VPS_USER      optional, defaults to deploy
VPS_PORT      optional, defaults to 22
```

Rollback is done by rerunning `GreenCloud VPS Deploy` with a previous commit SHA in `git_ref`.

The deploy workflow is built to recover from the manual bootstrap state. If `/opt/logivn/app` exists but is not a git checkout, the workflow moves it to `/opt/logivn/backups/worktrees/app-non-git-<timestamp>` and clones a fresh checkout. If the checkout is dirty, it saves status, diff, and untracked files under `/opt/logivn/backups/worktrees/dirty-<timestamp>` before forcing the requested deploy ref.

`LOGIVN_DEPLOY_BACKUP_ENABLED=auto` runs a runtime backup when Redis is already deployed and skips it during first bootstrap. Set it to `true` to force a backup before every deploy, or `false` to rely only on scheduled backups.

`LOGIVN_DOCKER_BUILD_PULL=true` forces Docker to refresh base image layers during deploy. The default uses the VPS cache so routine deploys are not blocked by transient Docker Hub auth or TLS failures.

## Runtime Secrets Checklist

Minimum required in `/opt/logivn/.env`:

```txt
LOGIVN_INTERNAL_API_KEY
REDIS_PASSWORD
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GF_SECURITY_ADMIN_PASSWORD
BULL_BOARD_USERNAME
BULL_BOARD_PASSWORD
```

Add provider keys as needed:

```txt
DASHSCOPE_API_KEY
XAI_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_CONNECT_TOKEN_SECRET
TELEGRAM_CALLBACK_SECRET
TELEGRAM_SESSION_SECRET
TELEGRAM_SESSION_TTL_SECONDS
TELEGRAM_TENANT_PICKER_MAX_OPTIONS
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_WEBHOOK_URL
TELEGRAM_RATE_LIMIT_MAX
TELEGRAM_RATE_LIMIT_DURATION_MS
TELEGRAM_CONNECT_RATE_LIMIT_MAX
TELEGRAM_CONNECT_RATE_LIMIT_WINDOW_MS
TELEGRAM_CALLBACK_RATE_LIMIT_MAX
TELEGRAM_CALLBACK_RATE_LIMIT_WINDOW_MS
TELEGRAM_AI_OPS_RATE_LIMIT_MAX
TELEGRAM_AI_OPS_RATE_LIMIT_WINDOW_MS
TELEGRAM_SEND_INTERVAL_MS
TELEGRAM_AI_OPS_TIMEOUT_MS
PLATFORM_TELEGRAM_BOT_TOKEN
PLATFORM_TELEGRAM_BOT_USERNAME
PLATFORM_TELEGRAM_WEBHOOK_SECRET
PLATFORM_TELEGRAM_WEBHOOK_URL
PLATFORM_TELEGRAM_SESSION_SECRET
PLATFORM_TELEGRAM_CONNECT_TOKEN_SECRET
PLATFORM_TELEGRAM_CONNECT_TOKEN_TTL_SECONDS
PLATFORM_AI_SECRET_KEY
PLATFORM_TELEGRAM_BOOTSTRAP_TOKEN
PLATFORM_TELEGRAM_ALLOWED_USER_IDS
PLATFORM_TELEGRAM_WORKER_CONCURRENCY
PLATFORM_TELEGRAM_RATE_LIMIT_MAX
PLATFORM_TELEGRAM_RATE_LIMIT_DURATION_MS
PLATFORM_TELEGRAM_CALLBACK_RATE_LIMIT_MAX
PLATFORM_TELEGRAM_CALLBACK_RATE_LIMIT_WINDOW_MS
PLATFORM_TELEGRAM_CONNECT_RATE_LIMIT_MAX
PLATFORM_TELEGRAM_CONNECT_RATE_LIMIT_WINDOW_MS
PLATFORM_TELEGRAM_SEND_INTERVAL_MS
OPERATIONAL_OUTBOX_RELAY_ENABLED
OPERATIONAL_OUTBOX_RELAY_INTERVAL_MS
OPERATIONAL_OUTBOX_RELAY_BATCH_SIZE
OPERATIONAL_OUTBOX_RELAY_MAX_ATTEMPTS
OPERATIONAL_OUTBOX_RELAY_LOCK_SECONDS
OPERATIONAL_OUTBOX_RELAY_BACKOFF_MS
OPERATIONAL_OUTBOX_RELAY_BACKOFF_MAX_MS
ORDERS_SLA_SCANNER_ENABLED
ORDERS_SLA_SCANNER_INTERVAL_MS
ORDERS_SLA_SCANNER_BATCH_SIZE
ORDERS_SLA_WARNING_MINUTES
ORDERS_SLA_WARNING_REPEAT_MINUTES
```

## Queue Inventory

BullMQ canonical queues:

- `telegram.notifications`, `platform.telegram.notifications`, `push.notifications`, `email.notifications`
- `orders.processing`, `orders.sla`, `orders.retry`
- `payments.confirmation`, `payments.retry`, `payments.reconciliation`
- `ai.analytics`, `ai.summary`, `ai.reports`, `ai.chat`
- `reservation.reminders`, `reservation.expiry`, `reservation.confirmation`
- `inventory.sync`, `inventory.alerts`
- `staff.attendance`, `staff.notifications`, `staff.requests`

Every queue has a matching `<queue>.dlq` dead-letter queue. Tenant Telegram
delivery is owned by the `telegram-bot` service. LogiVN internal DevOps Telegram
delivery is owned by `platform-telegram-bot`. `workers/index.mts` starts domain
workers for orders, payments, AI, reservations, inventory, staff, and non-Telegram
notifications.

`POST /events` is the preferred event-driven ingress. It routes operational events
such as `order.created`, `order.completed`, `payment.waiting_confirm`,
`payment.received`, `reservation.deposit_submitted`, `service_request.created`,
`inventory.low`, `staff.checked_in`, and `sla.warning` into the correct BullMQ
queues with tenant-aware payloads.

## Telegram Operations

Tenant Telegram is isolated in the `telegram-bot` service. Next.js never sends
Telegram messages directly from request handlers. Business flows publish
operational events to the gateway, the gateway routes tenant events into
`telegram.notifications`, and the Telegram worker performs fan-out with grammY.

Core runtime paths:

- `POST /events` on `gateway` for normal order/payment/reservation/inventory/SLA events
- `POST /queues/jobs` on `gateway` for explicit admin retry of failed Telegram notifications
- `GET /queues` and `GET /queues/failed` on `gateway` for queue, failed job, and DLQ visibility
- `POST /alerts` on `gateway` for Alertmanager; alerts are routed to `platform.telegram.notifications`
- `POST /webhook/set` on `telegram-bot` after `TELEGRAM_WEBHOOK_URL` is configured
- `GET /ready` on `telegram-bot` for configured/worker readiness

When the Telegram bot token and webhook secret are ready, set `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`,
`TELEGRAM_CALLBACK_SECRET`, and `TELEGRAM_CONNECT_TOKEN_SECRET` in
`/opt/logivn/.env`, restart the service, then run:

```bash
infra/vps/scripts/doctor.sh
infra/vps/scripts/configure-telegram-webhook.sh
```

`TELEGRAM_WEBHOOK_URL` must end with `/webhooks/telegram/$TELEGRAM_WEBHOOK_SECRET`
so Nginx routes the request to the `telegram-bot` container and the service can
validate Telegram's `X-Telegram-Bot-Api-Secret-Token` header.

The Dashboard Settings Telegram panel generates expiring connect tokens. Owners or
staff connect through:

```txt
/start <secure_token>
```

The bot records `telegram_user_id`, `chat_id`, `restaurant_id`, optional
`branch_id`, `user_id`, role, and resolved permissions in Supabase. Telegram IDs
are identifiers only; callbacks still require a signed token, expiry, connection
match, branch scope, and permission check.

Admins can revoke a connection from the same panel. Revocation marks the
connection as `revoked` and invalidates pending callback rows for that connection
so old inline buttons cannot mutate operations after access is removed.

Supported Phase 1/2 cards:

- `order.created`: order notification with confirm/cancel/view actions
- `order.confirmed`: kitchen/service notification with done/view actions
- `order.completed`, `order.cancelled`, `order.delivery_status_changed`: compact lifecycle cards
- `payment.waiting_confirm`: VietQR confirmation and amount mismatch actions
- `payment.received`: payment confirmation receipt
- `reservation.created`: new reservation card with reject/view actions
- `reservation.deposit_submitted`: deposit confirmation/reject actions
- `reservation.confirmed`, `reservation.rejected`, `reservation.cancelled`, `reservation.checked_in`, `reservation.seated`, `reservation.no_show`, `reservation.rescheduled`: reservation lifecycle cards
- `service_request.created`: call-staff card with resolve action
- `service_request.resolved`: service request closure card
- `inventory.low`: compact low-stock alert
- `sla.warning`: late order alert
- `menu.item_availability_suggested`: AI/menu availability card with hide/show actions
- `staff.checked_in`: attendance visibility card for owner/manager scope

## Platform Telegram DevOps Bot

The DevOps bot is intentionally separate from the tenant owner/staff bot. It uses
`platform_telegram_*` tables, `platform.telegram.notifications`, and
`/webhooks/platform-telegram/$PLATFORM_TELEGRAM_WEBHOOK_SECRET`. Tenant owners and
staff never share callback/session state with LogiVN developers.

Runtime paths:

- `POST /events` on `gateway` accepts `platform.alert` without `restaurantId` and normalizes it to `tenantId=platform`
- `platform.alert` routes to `platform.telegram.notifications`, not `telegram.notifications`
- `POST /webhook/set` on `platform-telegram-bot` configures the DevOps bot webhook
- `GET /ready` on `platform-telegram-bot` verifies token, webhook secret, and worker readiness

When `PLATFORM_TELEGRAM_*` secrets are ready, deploy the service and run:

```bash
infra/vps/scripts/doctor.sh
infra/vps/scripts/configure-platform-telegram-webhook.sh
```

Normal DevOps account setup starts in `admin.logivn.com/ops`. The DevOps
Telegram Command Center creates the `https://t.me/$PLATFORM_TELEGRAM_BOT_USERNAME?start=...`
link, shows active/revoked connections, token lifecycle, and recent audit logs,
and can revoke stale tokens or connected Telegram accounts. The connect token is
signed with `PLATFORM_TELEGRAM_CONNECT_TOKEN_SECRET`, stored only as a hash in
`platform_telegram_connection_tokens`, expires quickly, and can be consumed once.
Emergency bootstrap still supports `PLATFORM_TELEGRAM_ALLOWED_USER_IDS` or
`/start <PLATFORM_TELEGRAM_BOOTSTRAP_TOKEN>`. After connection, all buttons are
one-time signed sessions with scope checks such as `infra.read`, `queues.read`,
`incidents.read`, and `platform.admin`. The DevOps menu includes `/backup` for
a short R2 backup/RPO card, a signed manual-backup queue action, and an on-demand
detail card for artifacts, restore-test results, and open backup alerts.
Telegram-side self-service commands are `/whoami`, `/security`, and
`/disconnect`.

AI Ops commands use the app internal API and real tenant snapshots:

- `/doanhthu` opens revenue/report context
- `/tinhhinh` opens live operations context
- `/tonkho` opens inventory context
- `/brief` shows the recent Telegram-generated AI Ops briefings persisted in `telegram_owner_briefings`
- `/suco` shows open Telegram/Ops incidents from `telegram_ops_incidents`
- free text is treated as AI Ops chat

Each AI Ops command writes a branch-aware owner briefing with the model/provider,
compact summary, and top safe actions. This gives owners a durable Telegram
operations memory and gives support/admins a table-backed audit surface instead
of relying on Telegram chat history.

If one Telegram account maps to multiple active tenant connections, the bot sends
a compact signed tenant picker. Each option is backed by a one-time
`telegram_sessions` row, expires quickly, and is claimed against the Telegram user
before the AI request runs.

If tenant Telegram delivery fails, the worker marks the notification row failed or
rate-limited, BullMQ retries with Telegram-aware backoff, and the final failed job
is copied to `telegram.notifications.dlq`. Admin retry from the Dashboard requeues
the original event payload through `/queues/jobs` with a retry job id, preserving
event idempotency inside `telegram_notifications`. Non-Telegram push/email queues
use `PUSH_NOTIFICATION_WEBHOOK_URL` and `EMAIL_NOTIFICATION_WEBHOOK_URL` only when
an external provider is configured; otherwise they route sanitized operational
metadata to the Dev Telegram bot through `platform.telegram.notifications`.

Ingress from Telegram is rate-limited in Redis before expensive work:

- `/start <token>` uses `TELEGRAM_CONNECT_RATE_LIMIT_*`
- inline callback clicks use `TELEGRAM_CALLBACK_RATE_LIMIT_*`
- `/doanhthu`, `/tinhhinh`, `/tonkho`, and free-text AI Ops use `TELEGRAM_AI_OPS_RATE_LIMIT_*`

## Realtime Rooms and Events

Rooms:

- `restaurant:{restaurantId}`
- `restaurant:{restaurantId}:table:{tableId}`
- `order:{orderId}`

Events:

- `new_order`
- `order_confirmed`
- `kitchen_update`
- `payment_update`
- `staff_notification`
- `table_status_change`

## Backups

`infra/vps/scripts/backup.sh` creates:

- encrypted Supabase Postgres custom dumps
- Redis AOF/RDB volume backup after `BGSAVE` and `BGREWRITEAOF`
- sanitized VPS config backup from `/opt/logivn/.env`, Docker Compose, Nginx, Redis, scripts, and cron
- Supabase Storage bucket manifests and optional payload archives
- signed metadata records uploaded to private Cloudflare R2 through the Worker gateway

`install-cron.sh` schedules daily backups, Certbot renewal, weekly Docker prune, local health validation, and app cron handoff entries. It writes `CRON_TZ=$BACKUP_TIMEZONE` and `TZ=$BACKUP_TIMEZONE` into `/etc/cron.d/logivn-vps`, so backup schedules stay pinned to `Asia/Ho_Chi_Minh` unless `/opt/logivn/.env` intentionally overrides `BACKUP_TIMEZONE`.

Run a backup immediately after the first successful deploy:

```bash
APP_ROOT=/opt/logivn /opt/logivn/app/infra/vps/scripts/backup.sh --manual --actor sre --reason "first production backup"
APP_ROOT=/opt/logivn /opt/logivn/app/infra/vps/scripts/backup.sh --restore-test
```

The default restore test mode is `docker`: the script downloads the latest encrypted Postgres artifact, decrypts it locally, restores critical-table schema plus critical table data into a throwaway PostGIS-capable Postgres container, verifies `BACKUP_RESTORE_CRITICAL_TABLES` inside `BACKUP_RESTORE_TEST_SCHEMA`, records `backup_restore_tests`, and removes the container. `BACKUP_RESTORE_TEST_STRICT=false` lets the check tolerate non-critical managed-extension restore warnings while still failing if critical app tables cannot be restored and counted. Use `BACKUP_RESTORE_TEST_MODE=restore` only with an approved staging database URL; never point it at production.

For disaster recovery, use `RESTORE_RUNBOOK.md` to download, verify, and decrypt the approved R2 artifact first. `restore-redis-backup.sh` remains a local Redis-volume helper after the decrypted Redis archive has been selected. A real restore requires an explicit confirmation environment variable and creates a pre-restore Redis volume backup before replacing data:

```bash
CONFIRM_RESTORE=restore-logivn-redis infra/vps/scripts/restore-redis-backup.sh /opt/logivn/backups/20260101T000000Z.tgz
```

App cron handoff is intentionally disabled by default. Keep `LOGIVN_VPS_APP_CRONS_ENABLED=false` while Vercel Cron is still active, otherwise scheduled jobs can run twice. To move app crons to the VPS later:

1. Set `CRON_SECRET` in `/opt/logivn/.env`.
2. Set `LOGIVN_VPS_APP_CRONS_ENABLED=true`.
3. Disable or remove the matching `vercel.json` crons in the deployed frontend.
4. Re-run `infra/vps/scripts/install-cron.sh`.
5. Watch `/opt/logivn/logs/app-crons.log` and `admin.logivn.com/ops` after the next run window.

## Validation

Use local Docker smoke validation before touching the VPS:

```bash
infra/vps/scripts/smoke-compose.sh
```

Include Prometheus and Grafana provisioning in the same smoke run when changing
monitoring config:

```bash
SMOKE_MONITORING=true infra/vps/scripts/smoke-compose.sh
```

Use local validation before DNS/SSL:

```bash
infra/vps/scripts/validate.sh --local-only
```

Use full validation after DNS and SSL:

```bash
infra/vps/scripts/validate.sh
```

Use production readiness after a deploy, after a Redis restore, or before handing
the VPS to operations. It checks env readiness, Compose config, local service
health, Redis AOF/noeviction/maxmemory, event ingress, queues, locks, rate
limits, realtime state, Bull Board auth when enabled, Prometheus/Alertmanager
config, Grafana provisioning, Prometheus scrape targets, latest backup
restorability, and public HTTPS endpoints:

```bash
infra/vps/scripts/production-readiness.sh
```

## Production Notes

- Redis is not exposed publicly.
- Redis uses AOF, password auth, protected mode, maxmemory, and an internal Docker network.
- Redis/BullMQ uses `maxmemory-policy noeviction` so queue, lock, and stream keys are never silently evicted; producers should fail fast when Redis reaches its memory ceiling.
- Infrastructure images are pinned to explicit version tags in Compose, and `npm run infra:check` rejects `latest`, major-only, or minor-only tags. Upgrade Redis, Grafana, Prometheus, Alertmanager, RedisInsight, Uptime Kuma, node-exporter, and cAdvisor intentionally, then run `SMOKE_MONITORING=true infra/vps/scripts/smoke-compose.sh` before VPS rollout.
- Service ports bind to `127.0.0.1`; only Nginx exposes HTTPS.
- RedisInsight binds to `127.0.0.1:5540`; use an SSH tunnel instead of opening it publicly.
- Bull Board is disabled unless `BULL_BOARD_ENABLED=true` and protected by app-level Basic Auth. The monitor Nginx route also uses the monitoring htpasswd file.
- Grafana provisions the Prometheus datasource and the `LogiVN Redis + BullMQ Operations` dashboard from `infra/vps/monitoring/grafana/`. Treat those files as the source of truth; UI edits will not persist across reprovisioning.
- Docker log rotation is configured both daemon-wide and per service.
- Uptime Kuma must be claimed immediately after first deploy.
- Grafana sign-up is disabled; set a strong admin password before first boot.

Detailed Redis/BullMQ architecture: `../../docs/redis-bullmq-backbone.md`.
