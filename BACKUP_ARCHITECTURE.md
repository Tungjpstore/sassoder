# LogiVN Backup Architecture

## Goal

LogiVN backup exists for one outcome: no customer data loss during a production incident. The implementation is centered on the VPS executor at `infra/vps/scripts/backup.sh`, Supabase metadata tables, Cloudflare R2 storage, an optional Cloudflare Worker upload gateway, and Dev Telegram reporting.

```txt
Supabase Postgres / Storage / Redis / VPS configs
        -> infra/vps/scripts/backup.sh
        -> pg_dump -F c, Redis archive, sanitized config archive, Storage export
        -> OpenSSL encryption + SHA256 + signed metadata
        -> Cloudflare R2 upload through Worker gateway + size verification
        -> backup_jobs / backup_artifacts / backup_alerts
        -> Dev Telegram report + Control Center /backup
```

## Runtime Components

- Executor: `infra/vps/scripts/backup.sh`
- R2 gateway: `infra/cloudflare/backup-r2-gateway`
- Storage payload exporter: `scripts/infra/supabase-storage-export.mjs`
- Cron installer: `infra/vps/scripts/install-cron.sh`
- Metadata schema: `supabase/migrations/20260604102000_backup_dr_foundation.sql`
- Health/manual API: `/api/internal/backup/health`, `/api/internal/backup/trigger`
- Control Center: `admin.logivn.com/backup`
- Docs: `DISASTER_RECOVERY.md`, `RESTORE_RUNBOOK.md`, `R2_SETUP.md`, `TELEGRAM_BACKUP_ALERTS.md`

## Backup Scope

- Postgres: full `pg_dump -F c --no-owner --no-acl` from `DATABASE_URL` or `SUPABASE_DB_*`.
- Redis: RDB/AOF volume archive after `BGSAVE` and `BGREWRITEAOF` requests.
- VPS configs: nginx, docker compose, Redis config, scripts, cron, and a sanitized env template.
- Supabase Storage: bucket manifest plus recursive object payload archive on every daily, weekly, monthly, and manual backup by default.
- Application metadata: backup settings, platform settings metadata, and recent cron logs. The Postgres dump remains the source of truth.

## Schedule

Installed by `infra/vps/scripts/install-cron.sh`:

- Daily: `0 2 * * *` Asia/Ho_Chi_Minh, `backup.sh --daily`
- Weekly: `0 3 * * 0`, `backup.sh --weekly`
- Monthly: `0 4 1 * *`, `backup.sh --monthly`
- Restore rehearsal: `20 4 1 * *`, `backup.sh --restore-test`
- Manual poll: every 5 minutes, `backup.sh --claim-manual`

Every daily/weekly/monthly/manual data backup sends a completion report to LogiBot Dev after R2 upload verification and retention cleanup. The executor first resolves stale `backup_failed` alerts when the new data backup has real artifacts, then sends the Telegram report. If the data backup succeeds but the LogiBot Dev report cannot be delivered, the job is updated to `warn` and a `telegram_report_failed` alert is opened so operators do not see a false-clean success.

## Object Layout

```txt
logivn/prod/postgres/daily/2026-06-04/postgres_020000.dump.enc
logivn/prod/redis/daily/2026-06-04/redis_aof_020000.tar.gz.enc
logivn/prod/vps_configs/daily/2026-06-04/vps_configs_020000.tar.gz.enc
logivn/prod/storage_manifest/weekly/2026-06-07/supabase_storage_manifest_030000.json.enc
logivn/prod/storage_payload/weekly/2026-06-07/storage_payload_030000.tar.gz.enc
```

Each encrypted artifact has:

- `<object>.metadata.json`
- `<object>.metadata.sig`
- SHA256 in metadata and object custom metadata when the adapter supports it
- `backup_artifacts` row with checksum, size, type, status, and R2 path

## Security Model

- Backup files are encrypted before upload.
- Metadata is signed with `BACKUP_METADATA_SIGNING_KEY`.
- `.env` is never copied raw; config backup stores only a sanitized template.
- Telegram reports only metadata, never backup files or signed URLs.
- R2 bucket must remain private.
- Preferred production path is `BACKUP_STORAGE_ADAPTER=worker`, where the VPS only receives `BACKUP_R2_GATEWAY_URL` and a bearer token stored as a Worker secret.
- `BACKUP_STORAGE_ADAPTER=s3` is reserved for future S3-compatible expansion. If enabled later, its R2 token should be bucket-scoped and limited to required object operations.
- Encryption/signing keys must not be stored in R2.
- Raw backup download/restore requires super-admin operational approval and platform audit logging.

## Manual Trigger

`admin.logivn.com/backup` queues a `backup_jobs` row through `/api/internal/backup/trigger`. The VPS cron poller claims queued manual jobs through `claim_next_backup_job()` and runs the executor.

Direct operator command:

```bash
APP_ROOT=/opt/logivn /opt/logivn/app/infra/vps/scripts/backup.sh --manual --actor sre --reason "pre-release backup"
```

## Current Boundaries

- Daily Storage payload backup is enabled by default through `BACKUP_STORAGE_PAYLOAD_MODES=daily,weekly,monthly,manual` so the daily RPO includes uploaded assets. Large Storage buckets should be controlled with `BACKUP_STORAGE_BUCKETS`, `BACKUP_STORAGE_EXCLUDE_BUCKETS`, `BACKUP_STORAGE_MAX_OBJECTS`, and `BACKUP_STORAGE_MAX_BYTES` before allowing unlimited growth.
- BullMQ-specific backup queues are represented as VPS cron execution today. If the worker app is split later, map these modes to `backup.daily`, `backup.weekly`, `backup.monthly`, `backup.manual`, `backup.restore_test`, and `backup.alerts`.

## References

- Cloudflare R2 overview: https://developers.cloudflare.com/r2/
- R2 S3 API compatibility for future adapters: https://developers.cloudflare.com/r2/api/s3/api/
- R2 object lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
