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

Internal-only services:

- `redis`: persistent Redis for BullMQ and Socket.IO fan-out
- `ai-service`: OpenAI/xAI/Qwen/Claude provider routing and async AI jobs
- `image-service`: image optimization and PDF invoice generation
- `telegram-bot`: Telegram send-message bridge
- `prometheus`, `node-exporter`, `cadvisor`: lightweight metrics collection

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
- installs Docker, Docker Compose, Node.js 22, pnpm, PM2, Nginx, Certbot
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
infra/vps/scripts/deploy.sh
infra/vps/scripts/issue-certs.sh
infra/vps/scripts/install-cron.sh
infra/vps/scripts/validate.sh
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

## Runtime Secrets Checklist

Minimum required in `/opt/logivn/.env`:

```txt
LOGIVN_INTERNAL_API_KEY
REDIS_PASSWORD
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GF_SECURITY_ADMIN_PASSWORD
```

Add provider keys as needed:

```txt
DASHSCOPE_API_KEY
XAI_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
TELEGRAM_BOT_TOKEN
```

## Queue Inventory

BullMQ queues prepared by default:

- `notifications`
- `invoices`
- `ai-jobs`
- `image-optimization`
- `analytics`
- `delivery-routing`
- `cron-tasks`

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

- Redis volume backup
- `/opt/logivn/.env` backup
- Docker Compose/Nginx config backup
- recent Docker log sample

`install-cron.sh` schedules daily backups, Certbot renewal, weekly Docker prune, and local health validation.

## Validation

Use local validation before DNS/SSL:

```bash
infra/vps/scripts/validate.sh --local-only
```

Use full validation after DNS and SSL:

```bash
infra/vps/scripts/validate.sh
```

## Production Notes

- Redis is not exposed publicly.
- Service ports bind to `127.0.0.1`; only Nginx exposes HTTPS.
- Docker log rotation is configured both daemon-wide and per service.
- Uptime Kuma must be claimed immediately after first deploy.
- Grafana sign-up is disabled; set a strong admin password before first boot.
