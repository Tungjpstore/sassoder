# Telegram Backup Alerts

## Bot

Use the platform DevOps bot, not the tenant owner/staff bot.

Preferred env:

```env
PLATFORM_TELEGRAM_BOT_TOKEN=
DEV_TELEGRAM_CHAT_ID=
DEV_TELEGRAM_ALERTS_ENABLED=true
```

Optional override:

```env
BACKUP_TELEGRAM_BOT_TOKEN=
```

## Reports

Success report includes:

- environment
- mode and retention class
- artifact count
- uploaded byte size
- checksum status
- R2 verification status
- retention policy
- backup job id

Failure report includes:

- failed step
- error message
- job id
- RPO risk
- instruction to inspect `backup_jobs`, `backup_events`, and VPS logs

## Safety Rules

- Do not send raw backup files.
- Do not send signed download URLs.
- Do not send database URLs, service role keys, R2 secrets, or encryption keys.
- Keep messages metadata-only.
- Manual retry should be done by queueing a new job in `admin.logivn.com/backup` or running `backup.sh --manual` on the VPS.

## Operator Commands

Queue from Control Center:

```txt
admin.logivn.com/backup -> Backup ngay
```

Run from VPS:

```bash
APP_ROOT=/opt/logivn /opt/logivn/app/infra/vps/scripts/backup.sh --manual --actor sre --reason "retry after R2 timeout"
```

Check health:

```bash
curl -H "Authorization: Bearer $LOGIVN_INTERNAL_API_KEY" \
  https://logivn.com/api/internal/backup/health
```
