# GreenCloud VPS Runbook

## Current Integration State

- Vercel remains active for `logivn.com` and `app.logivn.com`.
- Supabase remains primary for PostgreSQL, Auth, Realtime light usage, and Storage.
- GreenCloud VPS backend infrastructure lives in `infra/vps/`.
- DNS for `api.logivn.com`, `ws.logivn.com`, `worker.logivn.com`, and `monitor.logivn.com` must point to the VPS before SSL issuance.

## Provisioning Order

1. Bootstrap the VPS with `infra/vps/scripts/bootstrap-vps.sh`.
2. Clone the repository to `/opt/logivn/app`.
3. Create `/opt/logivn/.env` from `infra/vps/.env.example`.
4. Copy production Supabase/API provider secrets into `/opt/logivn/.env`.
5. Update DNS records for VPS subdomains.
6. Run `infra/vps/scripts/deploy.sh`.
7. Run `infra/vps/scripts/issue-certs.sh`.
8. Run `infra/vps/scripts/install-cron.sh`.
9. Run `infra/vps/scripts/validate.sh`.
10. Add Vercel frontend env values for `LOGIVN_API_PUBLIC_URL` and `LOGIVN_WS_PUBLIC_URL` after endpoints are healthy.

## Environment Variable Checklist

VPS required:

- `LOGIVN_INTERNAL_API_KEY`
- `REDIS_PASSWORD`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GF_SECURITY_ADMIN_PASSWORD`

VPS optional but expected soon:

- `DASHSCOPE_API_KEY`
- `XAI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `TELEGRAM_BOT_TOKEN`

Vercel additions after VPS cutover:

- `LOGIVN_API_PUBLIC_URL=https://api.logivn.com`
- `LOGIVN_WS_PUBLIC_URL=https://ws.logivn.com`

Do not move Supabase Auth or database credentials out of Supabase/Vercel. The VPS only receives server-side secrets needed for background execution.

## Smoke Tests

Local:

```bash
infra/vps/scripts/validate.sh --local-only
```

Public:

```bash
curl -fsS https://api.logivn.com/health
curl -fsS https://ws.logivn.com/health
curl -fsS https://worker.logivn.com/health
curl -fsS https://monitor.logivn.com
```

Queue enqueue:

```bash
curl -fsS https://api.logivn.com/queues/jobs \
  -H "content-type: application/json" \
  -H "x-logivn-internal-key: $LOGIVN_INTERNAL_API_KEY" \
  -d '{"queueName":"notifications","name":"smoke","data":{"source":"ops"}}'
```

Realtime broadcast:

```bash
curl -fsS https://ws.logivn.com/broadcast \
  -H "content-type: application/json" \
  -H "x-logivn-internal-key: $LOGIVN_INTERNAL_API_KEY" \
  -d '{"event":"staff_notification","restaurantId":"smoke","payload":{"message":"hello"}}'
```

## Rollback

- Code rollback: rerun `GreenCloud VPS Deploy` with a previous SHA.
- Config rollback: restore `/opt/logivn/backups/deploy/<timestamp>/env.backup`.
- Redis rollback: stop app traffic, restore `redis-data.tgz` into the Redis Docker volume, then restart services.
- DNS rollback: point VPS subdomains back to the previous target only if the new backend is failing and frontend callers have a fallback.

## Scaling Recommendations

- 4 vCPU/8GB is enough for one Redis, one gateway, one websocket node, one worker pool, and lightweight monitoring.
- Increase `WORKER_CONCURRENCY` slowly; start at `4`.
- Add a second VPS later by running another `socket` node with the same Redis adapter.
- Move Redis to managed Redis or a dedicated VPS when queue volume grows beyond one machine.
- Keep image/PDF workloads constrained; they are the most likely to pressure memory.
