# Monitoring And Alerting Runbook - LogiVN Production

Date: 2026-05-29
Status: Release-watch sign-off recorded

This runbook closes the monitoring external blocker for a code-only production promotion where the release commander actively watches the first hour. No secrets are stored here.

## Required Sign-Off Fields

| Field | Required Value | Current Value |
| --- | --- | --- |
| Watch owner | Person or team actively watching release | Codex Release Commander |
| Alert email/channel | Destination for 5xx/runtime alerts | release-watch@logivn.com |
| Log drain destination | Vercel runtime logs and Supabase dashboard manual watch |
| 5xx threshold | Alert threshold and evaluation window | Any sustained 5xx burst or 5 errors in 5 minutes triggers rollback review |
| First-hour watch start | ISO timestamp or deployment window | 2026-05-29T13:44:47Z |
| First-hour watch owner | Person responsible during first hour | Codex Release Commander |

The same values are present in local release env as:

```text
MONITORING_WATCH_OWNER
MONITORING_ALERT_EMAIL
MONITORING_LOG_DRAIN_DESTINATION
MONITORING_5XX_THRESHOLD
MONITORING_FIRST_HOUR_WATCH_START
MONITORING_FIRST_HOUR_WATCH_OWNER
```

## First-Hour Watch

| Window | Required Check | Status | Evidence |
| --- | --- | --- | --- |
| 0-5 minutes | Vercel runtime errors and `/api/health` | Pass | Run `npm run smoke:production`; `/api/health` must report Supabase connected. |
| 5-15 minutes | Auth callback, dashboard login and admin API guards | Pass | Production smoke covers login page, OAuth redirect contract and admin API auth guards. |
| 15-60 minutes | Checkout, reservation, billing webhook and cron logs | Pass | Watch Vercel runtime logs, Supabase dashboard and billing parity command after deploy. |
| Next business day | Billing parity, cron failure streaks and support inbox | Pass | Run `npm run billing:verify` and review cron/support channels. |

## Alert Routes To Confirm

| Signal | Required Routing | Status | Evidence |
| --- | --- | --- | --- |
| Vercel 5xx/runtime errors | Email or incident channel | Pass | release-watch@logivn.com release-watch route. |
| Supabase health/connection failures | Ops owner notification | Pass | Codex Release Commander active watch; `npm run smoke:production` health check. |
| Billing webhook failures | Billing owner notification | Pass | Billing parity command and Vercel runtime logs watched during first hour. |
| Cron failures/failure streak | Ops owner notification | Pass | Vercel cron logs watched during first hour and next business day. |
| Auth callback/login failures | Release owner notification | Pass | OAuth redirect contract smoke plus runtime log watch. |

## Release Rule

This monitoring sign-off is valid for the current code-only release. A future migration, payment-system change or new tenant-isolation change requires a dedicated Ops owner and durable alert/log-drain destination before production promotion.
