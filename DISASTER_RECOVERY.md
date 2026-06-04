# LogiVN Disaster Recovery

## Objectives

- RPO target: under 24 hours for daily baseline, lower when manual pre-release backup is used.
- RTO target: restore critical Postgres data into staging within 60 minutes after backup access is approved.
- Primary rule: never restore into production before a staging restore test passes.

## Incident Levels

- High RPO risk: no successful backup, latest job failed, critical backup alert, or latest successful backup older than 36 hours.
- Medium RPO risk: latest successful backup older than 26 hours.
- Low RPO risk: latest successful backup within 26 hours and no critical backup alerts.

## Detection

Use:

```bash
curl -H "Authorization: Bearer $LOGIVN_INTERNAL_API_KEY" \
  https://logivn.com/api/internal/backup/health
```

Also check `admin.logivn.com/backup`, `backup_jobs`, `backup_artifacts`, `backup_restore_tests`, and Dev Telegram backup reports.

## Response Flow

1. Freeze risky writes if the incident may corrupt data.
2. Confirm latest successful backup and RPO from `/api/internal/backup/health`.
3. Open an incident in the Control Center and keep a human incident lead.
4. Restore the latest backup to staging using `RESTORE_RUNBOOK.md`.
5. Verify schema, critical table row counts, and application smoke checks.
6. Decide between rollback, repair, or production restore.
7. If production restore is approved, record actor, reason, backup object key, checksum, and timestamp in `platform_audit_logs`.
8. Keep old production data until the post-incident review is complete.

## Critical Tables

At minimum verify:

- `restaurants`
- `store_branches`
- `users`
- `customers`
- `orders`
- `payments`
- `reservations`
- `staff_members` / staff operation tables
- `audit_logs`
- `platform_audit_logs`
- `backup_jobs`

## Rollback Rules

- Do not delete old R2 objects during an active incident.
- Do not rotate backup encryption keys until restore has completed.
- Do not run restore against production from a laptop without an audit entry and second human approval.
- If restore fails at checksum or signature verification, stop and use the next newest backup.

## Communication

Dev Telegram should receive:

- incident opened
- selected backup object key
- staging restore started/completed
- production restore approved/started/completed
- post-restore verification result

Never send raw backup files, database URLs, service role keys, R2 secrets, or decrypted file paths in Telegram.
