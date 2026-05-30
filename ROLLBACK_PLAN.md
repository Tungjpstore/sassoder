# Rollback Plan - LogiVN Production

## 2026-05-30 Rollback Addendum

Rollback stance for this deploy: Vercel code rollback first; database fix-forward only if the additive schema itself causes issues.

| Layer | Rollback Action |
| --- | --- |
| Vercel app | Promote the previous stable production deployment or redeploy the previous commit, then run production smoke. |
| Supabase migration `20260530103818` | Leave additive columns/table/functions in place during code rollback. Do not drop staff identity columns or `staff_incident_reports` while production data may exist. |
| Dashboard performance cache | If cache causes stale data, disable `LOGIVN_VPS_DASHBOARD_CACHE_ENABLED` and redeploy/restart affected runtime; cache helpers fall back to Supabase. |
| Telegram callback actions | If internal Telegram actions fail, roll back Vercel code and watch `telegram_callback_actions`/audit logs for replay or permission errors. |
| Staff password flow | If staff login/change-password fails, roll back Vercel code; keep DB columns and repair data via fix-forward migration/service patch. |

Rollback triggers: health failure, 5xx spike, auth/login breakage, payment confirmation inconsistency, tenant leak suspicion, staff login outage, or dashboard latency worse than pre-release.

DB caveat: Supabase PITR is currently `false`, so destructive rollback is not approved. Future risky migrations require PITR/full backup proof first.

Date: 2026-05-20
Rollback confidence: low to medium-low until migration and backup blockers are closed.

## Current Rollback Assessment

| Layer | Rollback Readiness | Notes |
| --- | --- | --- |
| Vercel code | Medium | Vercel rollback or redeploy previous stable commit is available in principle. Deployment ID must be captured before release. |
| Supabase schema | Low | Migrations are forward-first. Current migration tracking is inconsistent and rollback SQL is not documented. |
| Billing data | Medium-low | Billing v2 parity now passes, but rolling code back may not undo v2 writes or bridge-side effects. |
| Env/config | Medium-low | Config rollback requires exact Vercel env snapshot; not captured in this review. |
| DNS/domain | Medium | Root domain smoke passed; DNS rollback not expected unless domain config changes. |
| Monitoring | Medium-low | Smoke exists; alert routing/log drains not proven. |

## Rollback Triggers

Rollback or freeze traffic immediately if any of these happen:

| Trigger | Action |
| --- | --- |
| Production 5xx spike or health endpoint fails | Roll back Vercel code first, keep DB state stable. |
| Auth callback/login broken | Roll back Vercel code, verify Supabase Auth URL config and cookies. |
| Cross-tenant data exposure suspected | Disable affected flow, revoke/rotate risky secrets if needed, preserve logs, do not continue deploy. |
| Billing entitlement mismatch | Disable billing cutover path or revert code to last stable entitlement source, then reconcile data. |
| Payment confirmation inconsistency | Freeze payment confirmation actions, preserve audit logs, run billing/payment reconciliation. |
| Migration failure mid-apply | Stop deployment, do not retry blindly, run database incident protocol. |
| Cron causing duplicate side effects | Disable/rotate `CRON_SECRET` or revert cron config in Vercel, then reconcile side effects. |

## Pre-Release Rollback Requirements

These must be completed before any production deployment:

1. Capture current production Vercel deployment ID.
2. Capture release candidate deployment ID.
3. Capture current production commit SHA.
4. Capture Supabase migration list before apply.
5. Capture Supabase backup/PITR timestamp.
6. Export or snapshot critical tables if the migration affects billing, auth, orders, reservations, staff, inventory or tenant isolation.
7. Document owner and contact path for Vercel, Supabase, billing and support.

## Code Rollback Procedure

Use when the issue is isolated to application code or Vercel config.

1. Stop further deploys.
2. Identify the last known good production deployment.
3. Roll back in Vercel or redeploy the last known good commit.
4. Run:

```bash
npm run smoke:production
```

5. Verify owner login, customer order route, `/api/health`, billing settings and affected flow.
6. Record incident notes and the deployment ID used for rollback.

## Database Rollback / Fix-Forward Procedure

Use when Supabase migration or data shape is involved.

Important rule:

- Do not assume code rollback reverses database state.
- Do not drop newly added columns/tables if production code or data may already depend on them.
- Prefer additive fix-forward migrations unless a tested rollback SQL exists.

Required steps:

1. Stop application deploy/promotion.
2. Confirm whether migration completed or partially failed.
3. Compare:

```bash
supabase migration list --linked
```

4. Validate affected tables and policies.
5. If data is safe but code is failing, roll back code and leave additive schema in place.
6. If policy/function/trigger logic is unsafe, ship a fix-forward migration that restores previous behavior.
7. If data corruption is suspected, escalate to Supabase restore/PITR decision before writing more data.

## Current Migration-Specific Rollback Notes

| Migration / Area | Rollback Position |
| --- | --- |
| `20260519090000_reservation_realtime_publication.sql` | Adds existing tables to `supabase_realtime` publication if absent. Prefer fix-forward by removing tables from publication only if verified safe and realtime dependency is disabled. |
| `20260518190204_staff_attendance_qr_device_trust.sql` | Adds attendance QR token table, staff device columns, constraints and request type. Do not remove request type while production rows exist. Feature-disable UI if code rollback is needed. |
| `20260518111842_default_single_branch_foundation.sql` | Backfills/defaults operational branches and changes geography/index behavior. Treat as data migration; rollback requires row-level audit and should be avoided without backup restore. |
| RLS helper rewrites | Policy-level rollback is high risk. Use tested fix-forward policy rewrite and verify tenant isolation. |
| Billing v2 bridge | Do not delete v2 billing rows during rollback. Parity currently passes, but source-of-truth/cutover behavior must be documented before release. |
| Pending `20260519*.sql` batch | Treat as unreleased until tracked, rehearsed and backed up. Do not apply any subset to production without an ordering and verification note. |
| Duplicate migration version risk | Latest local scan shows no duplicate versions. Keep this as a pre-apply check; if a duplicate appears or was manually applied, stop and repair migration history explicitly before continuing. |
| `20260519120000_billing_webhook_idempotency.sql` | Uses a regular unique partial index to avoid migration-runner transaction issues. If it fails, inspect duplicate `request_signature` rows before retrying. |

## Pending Batch Fix-Forward Map

| Migration | Failure Mode To Watch | Preferred Recovery |
| --- | --- | --- |
| `20260519090000_reservation_realtime_publication.sql` | Realtime subscription noise or missing updates after publication change. | Disable dependent realtime UI if needed; fix-forward publication membership only after checking `pg_publication_tables`. |
| `20260519092131_restrict_public_store_branch_reads.sql` | Public branch lookup or delivery quote starts returning empty data. | Do not restore broad anon reads blindly; add a narrower public read policy or server-side lookup path. |
| `20260519100000_inventory_order_atomicity.sql` | Order accept/cancel deadlock, stock over-deduction or permission failure. | Pause order acceptance if severe; fix-forward affected RPC/function and reconcile inventory movement rows. |
| `20260519101000_promotion_identity_timezone.sql` | Promotion usage trigger rejects valid orders or permits duplicate usage. | Disable affected promotion campaign, then fix-forward trigger logic and reconcile promotion usage rows. |
| `20260519102000_inventory_stale_stock_alert.sql` | Inventory alert creation/update fails. | Temporarily suppress stale-stock alert job/UI and fix-forward constraint/index behavior. |
| `20260519103000_staff_operations_security_hardening.sql` | Staff attendance or manager review is blocked by RLS/policy rewrite. | Hide affected staff operations UI and fix-forward policies; verify tenant-scoped reads before re-enabling. |
| `20260519103500_promotion_free_item_rewards.sql` | Free item reward pricing or FK behavior breaks checkout. | Disable free-item campaigns and fix-forward constraint/pricing logic. |
| `20260519110000_reservation_tenant_integrity_guards.sql` | Reservation/table bill inserts fail due to tenant mismatch trigger. | Pause affected reservation/table assignment mutations and fix-forward guard logic after validating restaurant/branch/table ownership. |
| `20260519112000_reservation_reminder_dedupe.sql` | Reminder outbox duplicates or rejects expected reminders. | Disable reminder sender, reconcile notification outbox, then fix-forward dedupe constraint. |
| `20260519114500_ai_owner_agent_approval_tokens.sql` | Owner AI action approval cannot create/consume tokens. | Disable AI apply-plan actions and fix-forward token table/policy/function behavior. |
| `20260519115000_ai_security_events.sql` | Security event writes fail or leak visibility. | Keep AI security stream service-role-only; fix-forward grants/RLS and verify anon/authenticated cannot read. |
| `20260519115500_ai_conversation_actor_scope.sql` | Existing AI conversations become inaccessible or cross-actor scope is wrong. | Disable conversation memory reuse and fix-forward actor scoping/backfill. |
| `20260519120000_billing_webhook_idempotency.sql` | Unique index fails due to duplicate webhook signatures or lock pressure. | Stop migration batch before production; inspect duplicate `request_signature` rows and reconcile billing logs before retrying. |
| `20260519190000_platform_admin_governance_hardening.sql` | Platform admin role permissions are over-deleted or scoped mutation fails. | Freeze platform admin mutations and restore intended permission rows with a fix-forward seed/migration. |
| `20260519201000_dashboard_operations_realtime_publication.sql` | Dashboard realtime events are noisy/missing. | Disable dashboard realtime dependence and fix-forward publication membership. |
| `20260519201100_users_lower_email_lookup_idx.sql` | Email helper performance remains slow or index build locks unexpectedly. | Cancel unsafe index build if still running; recreate during a maintenance window with a tested concurrent procedure. |

## Config Rollback

If env/config changed:

1. Restore previous Vercel env snapshot.
2. Redeploy or promote a deployment built with the restored env.
3. Confirm `NEXT_PUBLIC_APP_URL`, Supabase URL/key, service role, cron secret, email senders, map keys, AI provider keys and staff/admin secrets.
4. Run production smoke and affected manual checks.

## Feature-Level Containment

When full rollback is riskier than containment:

| Area | Containment Option |
| --- | --- |
| AI ops / morning brief | Disable email env gates and cron side effects. |
| Billing v2 | Keep legacy read path active until v2 parity is clean. |
| Staff QR/device trust | Hide UI entry points and block mutations at service layer. |
| Reservation realtime | Disable dependent realtime UI behavior and fall back to refresh/polling if available. |
| Maps/rate limiting | Disable high-cost providers via env and fall back to lower-risk provider chain. |

## Rollback Commander Checklist

Before declaring rollback complete:

1. Production URL responds.
2. `/api/health` returns Supabase connected.
3. Auth login path works.
4. Billing entitlement for known Pro/Premium tenants is correct.
5. Order and reservation create paths are healthy.
6. Cron jobs are not producing duplicate side effects.
7. Logs and support inbox show no ongoing customer-impacting errors.
8. Incident note records what was rolled back and what remains forward-only.
