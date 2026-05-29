# External Blockers Status - LogiVN Production

Date: 2026-05-29
Status: NO-GO until backup/PITR, authenticated QA and monitoring sign-off are closed

This file supersedes the 2026-05-20 blocker snapshot for current release decisions. The old audit said 16 `20260519*.sql` migrations were pending; the 2026-05-29 Supabase dry-run now reports the remote database is up to date.

## Latest Evidence

Run:

```bash
npm run release:blockers
```

Strict gate for CI/release commanders:

```bash
npm run release:blockers:strict
```

Latest local run on 2026-05-29 captured these signals:

| Check | Result | Evidence |
| --- | --- | --- |
| Supabase migration dry-run | Pass | `supabase db push --dry-run --linked --yes` returned `Remote database is up to date.` |
| Local migration files | Pass | 108 SQL migration files, latest `20260529105500_staff_attendance_daily_qr_wifi.sql`, no duplicate versions. |
| Supabase branches | Warning | Only default `main` branch exists; no non-default branch for future rehearsal. |
| Supabase backup/PITR | Blocked | `pitr_enabled=false`, `backups=[]`, `walg_enabled=true`. |
| Docker dump path | Pass | Colima/Docker is reachable and Supabase CLI schema dump completed. |
| `pg_dump` fallback | Warning | `pg_dump` is not installed locally. |
| Schema dump artifact | Pass | `reports/release/pre-release-schema-20260529T105852Z.sql` exists, 538092 bytes. Schema proof does not replace PITR or a full data backup. |
| Production smoke | Pass | `npm run smoke:production` passed 14/14 unauthenticated/public/auth-guard checks against `https://logivn.com`. |
| Authenticated QA | Blocked | `RELEASE_QA_SIGNOFF.md` is present but still pending tester sign-off. |
| Monitoring/alerting | Blocked | `MONITORING_ALERTING_RUNBOOK.md` is present but still pending real owner/routes/env values. |

## Blocker Register

| ID | Blocker | Current Status | Required Exit Criteria |
| --- | --- | --- | --- |
| EXT-01 | Staging migration rehearsal | Converted to residual risk | No migrations are pending in the current remote dry-run. For future migration batches, enable Supabase Branching, create a separate staging project, or run an approved isolated rehearsal before production apply. |
| EXT-02 | Backup/PITR proof | Blocked | Enable Supabase PITR or capture a usable full data backup plus restore notes. A schema-only dump now exists at `reports/release/pre-release-schema-20260529T105852Z.sql`, but it is not enough for data rollback. |
| EXT-04 | Authenticated QA | Blocked | Complete `RELEASE_QA_SIGNOFF.md` with real tester, timestamp and evidence for owner, Google OAuth, VietQR/order, reservation, staff and admin RBAC flows. |
| EXT-05 | Monitoring/alerting | Blocked | Complete `MONITORING_ALERTING_RUNBOOK.md` and provide `MONITORING_*` release env values for owner, alert destination, log drain, 5xx threshold and first-hour watch. |

## Production Decision

Current decision is NO-GO for production promotion because three blockers remain: backup/PITR proof, authenticated QA sign-off and monitoring/alerting sign-off.

The migration-specific blocker from the 2026-05-20 audit is no longer an apply blocker for the current remote state because the remote database is already up to date. It should be treated as a post-apply audit/residual process gap, not as a pending migration apply step.
