# LogiVN Migration Log

## 2026-05-29 Refresh

Current release evidence no longer matches the 2026-05-20 pending-batch snapshot:

- Local SQL migration files: 110.
- Latest local migration: `20260530103818_staff_identity_password_login.sql`.
- Duplicate migration versions: none found.
- `supabase db push --dry-run --linked --yes`: pass, `Remote database is up to date`.
- `supabase branches list --project-ref tfhqatvevbrbzaaqjhfa -o json`: only default `main` branch exists.
- `supabase backups list --project-ref tfhqatvevbrbzaaqjhfa -o json`: `pitr_enabled=false`, `backups=[]`, `walg_enabled=true`.
- Colima/Docker is reachable and a schema-only dump exists at `reports/release/pre-release-schema-20260529T105852Z.sql` (538092 bytes). `pg_dump` is not installed locally. PITR/full data rollback proof is still missing.

Production migration apply is not currently pending, but production promotion remains NO-GO until backup/PITR proof, authenticated QA and monitoring sign-off are complete. Use `EXTERNAL_BLOCKERS_STATUS.md` and `npm run release:blockers` as the current evidence path.

Last updated: 2026-05-20

## Current Snapshot

- Local SQL migration files: 110
- Tracked migration files: 110
- Untracked migration files: 0
- Current integration branch: `codex/p0-production-clean`
- Current local commit: `879cfbf`
- Current upstream commit: `57d9784`
- Branch relationship: local is ahead of upstream by 2 commits, behind by 0
- Working tree status during snapshot: clean

## Release Commander Status

This migration log is not a production apply approval. It records the current release-risk picture and the clean local artifact state.

Production migration remains blocked until:

- remote and local migration history are reconciled,
- the pending batch is rehearsed on staging using `MIGRATION_RELEASE_REHEARSAL.md`,
- backup/PITR proof is captured,
- rollback/fix-forward notes are signed off by the DB rollback commander.

## Latest Migration Files

| Migration | Area | Risk |
| --- | --- | --- |
| `20260519201000_dashboard_operations_realtime_publication.sql` | Dashboard realtime publication | High: realtime blast radius and table publication scope. |
| `20260519201100_users_lower_email_lookup_idx.sql` | RLS helper performance | P0: indexes lower(email) fallback used by tenant helper policies. |
| `20260519190000_platform_admin_governance_hardening.sql` | Platform admin governance | High: admin RBAC, role permission cleanup, auditability. |
| `20260519120000_billing_webhook_idempotency.sql` | Billing webhook idempotency | High: payment replay safety and billing integrity. |
| `20260519115500_ai_conversation_actor_scope.sql` | AI conversation actor scope | High: memory isolation, anonymous thread reuse prevention. |
| `20260519115000_ai_security_events.sql` | AI security events | High: service-role-only security audit stream, RLS, event indexes. |
| `20260519114500_ai_owner_agent_approval_tokens.sql` | AI owner approval tokens | High: approval token hashing, expiry, RLS. |
| `20260519112000_reservation_reminder_dedupe.sql` | Reservation reminder dedupe | Medium-high: notification outbox idempotency. |
| `20260519110000_reservation_tenant_integrity_guards.sql` | Reservation tenant integrity | High: FK tenant consistency and trigger guards. |
| `20260519103500_promotion_free_item_rewards.sql` | Promotion free item rewards | Medium-high: promotion reward FK, constraints, pricing semantics. |
| `20260519103000_staff_operations_security_hardening.sql` | Staff operations security | High: HR RLS, direct mutation revokes, attendance integrity. |
| `20260519102000_inventory_stale_stock_alert.sql` | Inventory stale stock alerts | Medium-high: inventory alert correctness and indexes. |
| `20260519101000_promotion_identity_timezone.sql` | Promotion identity/timezone | Medium-high: promotion usage identity, trigger behavior. |
| `20260519100000_inventory_order_atomicity.sql` | Inventory order atomicity | High: stock movement transaction safety. |
| `20260519092131_restrict_public_store_branch_reads.sql` | Branch RLS isolation | P0: removes anon-wide active branch reads from Data API surface. |

## Pending Remote Batch

Current release review treats these as pending remote migrations until proven otherwise:

| Migration | Required Staging Proof |
| --- | --- |
| `20260519090000_reservation_realtime_publication.sql` | `pg_publication_tables` contains expected reservation/table tables and no accidental broad publication. |
| `20260519092131_restrict_public_store_branch_reads.sql` | Public branch lookup still works only through approved app paths; anon-wide branch reads remain closed. |
| `20260519100000_inventory_order_atomicity.sql` | Accept/cancel order RPCs preserve stock movement consistency under repeated calls. |
| `20260519101000_promotion_identity_timezone.sql` | Promotion identity/timezone trigger accepts valid orders and blocks duplicate usage. |
| `20260519102000_inventory_stale_stock_alert.sql` | Stale-stock alert constraints and indexes do not block inventory writes. |
| `20260519103000_staff_operations_security_hardening.sql` | Staff RLS and attendance writes behave for owner, manager and staff roles. |
| `20260519103500_promotion_free_item_rewards.sql` | Free item campaign checkout path prices and records rewards correctly. |
| `20260519110000_reservation_tenant_integrity_guards.sql` | Cross-restaurant table assignment is rejected while valid reservation/table bill writes pass. |
| `20260519112000_reservation_reminder_dedupe.sql` | Reservation reminders are idempotent and do not duplicate outbox rows. |
| `20260519114500_ai_owner_agent_approval_tokens.sql` | Approval tokens are service-role-only and expire/consume correctly. |
| `20260519115000_ai_security_events.sql` | Anon/authenticated users cannot read/write the security event stream. |
| `20260519115500_ai_conversation_actor_scope.sql` | Existing AI conversation reads stay scoped to the correct actor. |
| `20260519120000_billing_webhook_idempotency.sql` | Regular unique partial index applies without relying on concurrent-index transaction behavior. |
| `20260519190000_platform_admin_governance_hardening.sql` | Platform admin RBAC cannot exceed scoped permissions. |
| `20260519201000_dashboard_operations_realtime_publication.sql` | Dashboard realtime tables are published intentionally and UI degrades if realtime is unavailable. |
| `20260519201100_users_lower_email_lookup_idx.sql` | Email lookup index exists and helper performance does not regress. |

## Dry-Run Evidence

`supabase db push --dry-run --linked --yes` exits 0 and would apply these 16 migrations without changing the database:

```text
20260519090000_reservation_realtime_publication.sql
20260519092131_restrict_public_store_branch_reads.sql
20260519100000_inventory_order_atomicity.sql
20260519101000_promotion_identity_timezone.sql
20260519102000_inventory_stale_stock_alert.sql
20260519103000_staff_operations_security_hardening.sql
20260519103500_promotion_free_item_rewards.sql
20260519110000_reservation_tenant_integrity_guards.sql
20260519112000_reservation_reminder_dedupe.sql
20260519114500_ai_owner_agent_approval_tokens.sql
20260519115000_ai_security_events.sql
20260519115500_ai_conversation_actor_scope.sql
20260519120000_billing_webhook_idempotency.sql
20260519190000_platform_admin_governance_hardening.sql
20260519201000_dashboard_operations_realtime_publication.sql
20260519201100_users_lower_email_lookup_idx.sql
```

## Staging / Backup Evidence

- `supabase branches list --project-ref tfhqatvevbrbzaaqjhfa` exits 0 and shows no preview branches.
- `supabase branches create release-20260520 --project-ref tfhqatvevbrbzaaqjhfa` exits 1: Branching requires Supabase Pro or above.
- `supabase backups list --project-ref tfhqatvevbrbzaaqjhfa` exits 0 and reports `WALG=true`, `PITR=false`, `EARLIEST TIMESTAMP=0`, `LATEST TIMESTAMP=0`.
- `supabase db dump --linked --file /tmp/...pre-release-schema.sql` exits 1 because Docker daemon is not running; the empty 0B dump artifact was removed.

Release commander note: production migration remains blocked until a staging/rehearsal database and usable backup/PITR evidence are available.

## Safety Rules

- Review all migrations that contain `drop`, `delete from`, trigger rewrites, RLS rewrites, or function replacement.
- Apply migrations to staging before production.
- Keep `supabase/schema.sql` aligned with applied migrations.
- Do not reorder timestamped migrations after they have been applied remotely.
- Record rollback notes for destructive or permission-related migrations.

## Pre-Release Checks

```bash
git status --short --branch
rg -n -i '\b(drop|truncate|delete from|alter table .* drop|drop policy|drop function|drop trigger|drop index)\b' supabase/migrations supabase/schema.sql
npx tsx --test lib/database-reliability-audit.test.ts lib/rls-helper-migrations.test.ts lib/staff-rls-migrations.test.ts
npm run lint
npx tsc --noEmit --pretty false --incremental false
npm test
```

## Backup / Restore / Rollback

- Run `supabase db dump --linked --file <timestamp>-pre-release.sql` before production migration batches.
- Keep point-in-time recovery enabled for the production project before destructive or RLS-sensitive migrations.
- Do a restore rehearsal against staging or a disposable Supabase branch before release-sensitive batches.
- Rollback for RLS-only changes should prefer a forward migration that restores the previous policy shape; do not reorder or delete applied timestamped migrations.
- Rollback for destructive data changes requires restoring from the pre-release dump or point-in-time recovery after pausing writes.

## Open Follow-Ups

- Add Supabase staging apply notes after the next migration rehearsal.
- Confirm `20260519120000_billing_webhook_idempotency.sql` on staging; it no longer uses `create index concurrently`.
- Add production rollback notes for platform admin RBAC.
- Confirm whether inventory warehouse v2 migrations need seed or backfill steps.
