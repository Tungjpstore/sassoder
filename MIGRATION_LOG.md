# LogiVN Migration Log

## 2026-06-01 Tenant/RLS Addendum

- Added local migration `20260601122332_harden_restaurant_members_view.sql` after live E2E proved `public.restaurant_members` could leak cross-tenant member rows when the view used definer privileges.
- Applied the view hardening SQL directly with `supabase db query --linked --file supabase/migrations/20260601122332_harden_restaurant_members_view.sql` to avoid pushing unrelated parallel migration work in the same batch.
- `supabase db push` history still needs reconciliation before the next production migration push; do not treat the 2026-05-29 dry-run evidence below as current for this new migration set.
- Linked DB spot check found no public base tables with RLS disabled, and `npm run e2e:owner-onboarding` verifies owner A cannot read owner B via `restaurants`, `users`, or `restaurant_members`.

## 2026-05-29 Refresh

Current release evidence no longer matches the 2026-05-20 pending-batch snapshot:

- Local SQL migration files: 112.
- Latest local migration: `20260601122332_harden_restaurant_members_view.sql`.
- Duplicate migration versions: none found.
- `supabase db push --dry-run --linked --yes`: stale 2026-05-29 evidence; rerun and reconcile migration history before using this as release evidence.
- `supabase branches list --project-ref tfhqatvevbrbzaaqjhfa -o json`: only default `main` branch exists.
- `supabase backups list --project-ref tfhqatvevbrbzaaqjhfa -o json`: `pitr_enabled=false`, `backups=[]`, `walg_enabled=true`.
- Colima/Docker is reachable and a schema-only dump exists at `reports/release/pre-release-schema-20260529T105852Z.sql` (538092 bytes). `pg_dump` is not installed locally. PITR/full data rollback proof is still missing.

Production migration apply requires reconciliation after the 2026-06-01 tenant/RLS hotfix, and production promotion remains NO-GO until backup/PITR proof, authenticated QA and monitoring sign-off are complete. Use `EXTERNAL_BLOCKERS_STATUS.md` and `npm run release:blockers` as the current evidence path.

## 2026-06-17 Staff HR Security Addendum

- Added local migration `20260617085431_staff_hr_security_hardening_private_qr_rpc.sql` to move staff attendance QR token consumption behind a private `app_private` security-definer RPC with a service-role-only public wrapper.
- The migration preserves `app_private` usage and helper execute grants for `authenticated` and `service_role` so existing tenant RLS helpers continue to work.
- Added local migration `20260617134652_staff_attendance_source_proof_hardening.sql` to require QR/WiFi attendance logs to carry source-specific audit proof before payroll review.
- Production apply still requires Supabase dry-run, staging rehearsal, backup/PITR proof, and post-apply QR attendance smoke checks.

## 2026-07-22 Staff Avatar RLS Repair Addendum

- Before this repair, the branch contained 138 local SQL migration files; the latest was `20260622083200_billing_delivery_realtime_entitlement_sync.sql`.
- Added forward-only migration `20260722090000_staff_avatar_rls_private_helper_repair.sql` so databases that already applied the original avatar migration recreate the insert, update and delete policies with `app_private.current_restaurant_id()`.
- Corrected the original `20260602143000_staff_avatar_and_open_attendance_recovery.sql` source for fresh bootstrap without restoring the revoked public helper.
- This addendum is migration history evidence only. The repair is not production-approved until remote history reconciliation, staging rehearsal, backup/PITR proof and post-apply staff avatar authorization checks are complete.

## 2026-07-22 Owner And Financial DML Hardening Addendum

- Added `20260722100000_staff_owner_boundary_hardening.sql` with a canonical `restaurants.owner_user_id`, legacy ADMIN backfill, owner-role repair, and service-role-only guarded staff profile/account RPC wrappers.
- Added `20260722103000_financial_dml_hardening.sql` to revoke direct authenticated mutations on orders, bills, payment logs and reservations, enforce same-tenant order-to-bill references, and lock/validate bill recalculation.
- Release review tightened the owner migration with a composite tenant FK, deterministic active-ADMIN owner checks, all eight system roles and permissions, manager billing cleanup, active-tenant unresolved-owner failure, canonical-owner-only role assignment, a direct Data API owner-column guard and PostgREST schema reload. Financial preflight now reports orphan as well as cross-tenant bill links before DDL, and the bill-sync trigger is recreated explicitly.
- An isolated local Supabase/PostgreSQL 17 start was attempted on alternate ports. Docker initialization failed with `No space left on device`; no existing Supabase project, container or volume was stopped or pruned. This attempt is not migration execution evidence.
- A read-only GreenCloud control-panel check found VPS `logivn-prod-vps-01` running normally, but its Backups page reported `No backups found` despite a four-week retention setting. No backup/restart/deploy/configuration action was performed because the VPS hosts concurrent workloads. Production promotion remains blocked until a recoverable VPS backup is created and restored successfully to an isolated target.
- These migrations are local forward-only artifacts and have not been approved for production. Apply them first to an isolated PostgreSQL rehearsal database, verify existing data/backfill ambiguity, grants, composite FK behavior and rollback/fix-forward notes, then reconcile remote migration history.

Last updated: 2026-09-03

## 2026-09-03 Phase 1 Production Apply

- Target: Supabase project `qr-restaurant-saas`, ref `tfhqatvevbrbzaaqjhfa`, database `main / Production`.
- Preflight: `cross_tenant_tables=0`, `cross_tenant_orders=0`; inventory contained 32 `inventory_locations` rows and no rows in the remaining inventory ledger tables.
- Apply: `20260903090000_phase1_security_transaction_hardening.sql` executed successfully in one explicit transaction through the authenticated Supabase SQL Editor session; migration history row inserted with version `20260903090000`.
- Post-apply: `assert_staff_actor_session`, `create_reservation_with_lock`, `create_order_with_items_atomic`, and all three guarded staff wrappers exist as `SECURITY DEFINER`; `tables_restaurant_branch_id_fkey` and `orders_restaurant_branch_id_fkey` are validated; `store_branches_restaurant_id_id_key` exists.
- Privilege post-apply: authenticated inventory write grants returned `0`; anonymous/authenticated execution of atomic order/reservation RPCs is `false`; service-role execution is `true`.
- Operational limitation: the project remains on the Free plan with no configured backup/PITR evidence and no staging branch. Phase 1 SQL is applied, but broader release readiness is still **NO-GO** until recoverable backup/restore and authenticated smoke evidence are captured.

## Current Snapshot

- Local SQL migration files: 146
- Tracked migration files: 146
- Git-untracked migration files: 0
- Latest local migration: `20260905090000_phase_a_legacy_qr_default_off.sql`
- Current integration branch: `hoplite/koroneia-ffa429c4`
- Current local commit: `d4a97ccedef9d8fe2895e486eccca6589fe585c6`
- Current upstream commit: `d4a97ccedef9d8fe2895e486eccca6589fe585c6`
- Branch relationship: local and upstream are aligned (0 ahead, 0 behind)
- Working tree status: Phase A adds one forward-only migration that changes the `restaurants.allow_legacy_qr` default for new tenants; no migration files remain untracked.

## 2026-09-03 Phase 2 Production Apply

- Target: Supabase project `qr-restaurant-saas`, ref `tfhqatvevbrbzaaqjhfa`, database `main / Production`.
- Preflight: `inventory_locations` and `stock_balances` schemas present; `orders.branch_id` present; `inventory_reservations` absent before apply; cross-tenant inventory location/balance checks returned `0`.
- Apply: `20260903100000_phase2_inventory_reservation_ledger.sql` executed successfully in one explicit transaction through the authenticated Supabase SQL Editor session.
- Post-apply: `inventory_reservations=1`, reservation/consume/release RPCs and `cancel_order_with_inventory_reservation_rollback` exist; `reserved_balance_violations=0`.
- Migration history: inserted version `20260903100000` with name `phase2_inventory_reservation_ledger` and `created_by=codex_sql_editor`.
- Rollback posture: fix-forward only; disable prepaid reservation wiring per tenant if needed, and do not delete reservation or movement history.
- Operational limitation: production still has no configured backup/PITR evidence or staging branch. Phase 2 is applied, but broader release readiness remains **NO-GO** until recoverable backup/restore, concurrency rehearsal and authenticated smoke evidence are captured.

## 2026-09-03 Phase 2 Scope Fix And Rehearsal

- Added and applied fix-forward migration `20260903103000_phase2_inventory_reservation_scope_fix.sql`.
- Post-apply checks: scope trigger `1`, history row `1`, service-role direct write grants `0`, reservation scope violations `0`.
- Production transactional rehearsal passed and rolled back completely: reservation retry idempotency, competing reservation rejection, consume-once, release-once, branch mismatch rejection and `reserved_quantity` invariant.
- The rehearsal used temporary rows inside one transaction and ended with `ROLLBACK`; no test order, ingredient, stock or reservation remains.
- `npm run smoke:production` passed all 16 public/auth-guarded production checks, including Supabase health, customer ordering/reservation pages and OAuth safety contracts.
- `npm audit fix` applied non-breaking lockfile updates and Next.js was upgraded from `16.2.6` to `16.3.4`; current full audit reports 20 findings (5 low, 7 moderate, 8 high) and the production-only audit reports 13 findings (2 high). Remaining findings require planned upstream upgrades; no `--force` was used.
- Remaining release blockers are infrastructure/operations only: no recoverable backup/PITR evidence, no staging branch, and authenticated UI smoke still needs a real operator flow.

## 2026-09-03 Phase 2 Local Candidate

- Added `20260903100000_phase2_inventory_reservation_ledger.sql` with service-role-only `reserve_order_inventory`, `consume_order_inventory`, `release_order_inventory`, and reserved-acceptance RPCs.
- Prepaid remote orders now reserve only the resolved order branch (or null/global stock), consume the reservation once on acceptance, and release it before cancellation.
- Allocation plans are canonically sorted to reduce multi-line advisory-lock deadlocks and retries remain idempotent by order/allocation key.
- Local validation: TypeScript, targeted ESLint, production build, and `npm test` pass (`758 passed`, `0 failed`, `1 skipped`). PostgreSQL concurrency rehearsal remains pending because no rehearsal database URL is configured.
- Production apply: completed on 2026-09-03 after explicit transaction and post-apply checks; staging/concurrency rehearsal remains pending.

## 2026-09-03 Phase 2 Prepaid Consistency Fix

- Added `20260903110000_phase2_prepaid_consistency_fix.sql` as a fix-forward migration.
- Reservation retries now replay the existing allocation set instead of selecting a second FEFO batch.
- Consuming a prepaid reservation now decrements both `stock_balances` and the legacy `ingredients.on_hand_quantity` aggregate in one transaction.
- The SQL Editor apply is still being reconciled; production history must show `20260903110000` before this migration is considered applied.

## Current Reconciliation Status (2026-07-22)

- Current remote migration reconciliation is incomplete: linked project access returned HTTP 403, and direct database verification is blocked because `SUPABASE_DB_PASSWORD` is not available in the current environment.
- Local repair `20260722090000_staff_avatar_rls_private_helper_repair.sql` has not been applied to the remote database.
- No current pending-migration count or dry-run apply list is asserted. The 16-migration batch and dry-run output retained below are historical 2026-05-29 evidence only.

## Release Verification (2026-07-22)

- Release decision: **NO-GO**.
- `npm test`: 753 discovered, 752 passed, 0 failed, 1 skipped; the skipped case is the PostgreSQL reservation rehearsal without a usable database URL.
- TypeScript, targeted ESLint and the Next.js 16.2.6 production build pass; the build generated 160 static pages.
- `npm run infra:check` reports zero direct LogiVN app service-role violations. It still fails for four environment keys used only in the excluded `logimail/` area; LogiMail was not modified for this audit.
- `npm audit --audit-level=high` remains red with 33 vulnerabilities: 6 low, 22 moderate and 5 high.
- `npm run release:blockers:report` returns NO-GO with six automated blockers: Supabase branches, dry-run, backup/PITR, authenticated QA, monitoring/alerting and Staff HR production secrets. PostgreSQL rehearsal failure and missing GreenCloud backup/restore proof are additional blockers outside that count.

## Release Commander Status

This migration log is not a production apply approval. It records the current release-risk picture and the local artifact state for this remediation.

Production migration remains blocked until:

- remote and local migration history are reconciled,
- the pending batch is rehearsed on staging using `MIGRATION_RELEASE_REHEARSAL.md`,
- backup/PITR proof is captured,
- GreenCloud VPS backup and isolated restore proof are captured without interrupting concurrent workloads,
- rollback/fix-forward notes are signed off by the DB rollback commander.

## Latest Migration Files

| Migration | Area | Risk |
| --- | --- | --- |
| `20260903103000_phase2_inventory_reservation_scope_fix.sql` | Reservation order/tenant/branch trigger guard and direct-write revocation | High: fix-forward integrity guard; requires PostgreSQL rehearsal evidence. |
| `20260903100000_phase2_inventory_reservation_ledger.sql` | Prepaid inventory reservation, consume/release ledger and branch-aware stock isolation | P0: requires PostgreSQL concurrency rehearsal and production preflight before apply. |
| `20260903090000_phase1_security_transaction_hardening.sql` | Phase 1 RBAC, inventory DML, tenant-branch FKs and reservation transaction RPC | P0: requires PostgreSQL rehearsal, data preflight and authenticated actor verification before production apply. |

| Migration | Area | Risk |
| --- | --- | --- |
| `20260722103000_financial_dml_hardening.sql` | Financial DML and tenant FK hardening | P0: revokes direct financial writes and adds same-tenant bill references; requires data preflight and PostgreSQL rehearsal. |
| `20260722100000_staff_owner_boundary_hardening.sql` | Canonical owner and staff account boundary | P0: repairs legacy ADMIN ownership and wraps privileged staff mutations; requires owner backfill ambiguity and role/session rehearsal. |
| `20260722090000_staff_avatar_rls_private_helper_repair.sql` | Staff avatar storage RLS | High: forward-repairs tenant and staff ownership checks to use the private tenant helper. |
| `20260622083200_billing_delivery_realtime_entitlement_sync.sql` | Billing entitlements | High: latest pre-repair migration on this branch; production state is not asserted here. |
| `20260617134652_staff_attendance_source_proof_hardening.sql` | Staff HR attendance security | P0: DB guardrails require QR token and WiFi network proof on source-specific attendance logs. |
| `20260617085431_staff_hr_security_hardening_private_qr_rpc.sql` | Staff HR attendance security | P0: moves QR consume mutation into private schema while preserving tenant RLS helper grants. |
| `20260614090000_logimail_deliverability_backfill.sql` | Logimail deliverability | High: deliverability data backfill must be rehearsed before production apply. |
| `20260613170000_inventory_actor_scope_jwt_role_fix.sql` | Inventory actor scope | High: fixes JWT role handling in inventory actor scoping. |
| `20260613120000_order_items_prepared_at.sql` | Orders kitchen timing | Medium-high: adds prepared-at tracking for order item workflow. |
| `20260612170000_staff_payroll_deductions.sql` | Staff payroll | High: payroll-ready deductions and compensation accounting. |
| `20260601122332_harden_restaurant_members_view.sql` | Tenant/RLS hardening | P1: forces public view reads through caller RLS and revokes anon access. |
| `20260601121000_staff_attendance_anti_fraud_hardening.sql` | Staff attendance anti-fraud | High: forward-only attendance integrity constraints and trusted network guardrails. |
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

## Historical Pending Remote Batch (2026-05-29)

The following table is retained as the pending batch recorded on 2026-05-29. It is not the current remote migration delta and must not be used for release approval.

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

## Historical Dry-Run Evidence (2026-05-29)

On 2026-05-29, `supabase db push --dry-run --linked --yes` exited 0 and reported that it would apply these 16 migrations without changing the database. This output is historical and does not represent the current branch or remote state:

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

## CI Gate Scope (2026-09-05)

Release CI was red on every branch, including `main`, for reasons unrelated to the code under review. The gates were repaired without weakening release policy:

- `npm ci` failed with `EUSAGE` because `package-lock.json` was regenerated by npm 11 while CI runs Node 22 / npm 10.9.8. npm 10 resolves the optional `proxy-agent` peer of the nested `@puppeteer/browsers@3.2.1` and npm 11 does not, so the committed tree was missing 14 packages from npm 10's perspective. The lockfile is now generated with npm 10.9.8 and `npm ci` is verified under both npm 10.9.8 and npm 11.
- `npm run release:blockers:strict` cannot pass on a pull request by construction: `authenticated-qa` requires `RELEASE_QA_SIGNOFF.md` to already contain the candidate branch and full commit SHA, and the Supabase/monitoring/Staff-HR checks require live production credentials. Pull requests and `main` pushes now run `release:blockers:report`, which collects and publishes the same evidence and still prints the NO-GO decision; `workflow_dispatch` promotion runs keep the blocking `release:blockers:strict` gate.
- `npm audit --audit-level=high` is now scoped with `--omit=dev`. The remaining high-severity findings are entirely inside the dev-only Lighthouse CI chain (`@lhci/cli` -> `lighthouse@12.6.1` -> `puppeteer-core` -> `extract-zip`), which `@lhci/cli@0.15.1` pins exactly and which never ships to users. Production runtime dependencies are clean after adding an `@ai-sdk/provider-utils` -> `undici@6.28.1` override, which clears the WebSocket DoS advisories reached through `@copilotkit/runtime`.
- `npm run infra:check` failed on 13 environment keys. Twelve belong to the LogiMail P0 hardening work merged after the last green run and are now declared in `.env.example`; `NEXT_DEV_ALLOWED_ORIGINS` is the new dev-only origin allowlist.

Local verification of the full pipeline at this commit: `infra:check`, `lint`, `tsc --noEmit`, `npm test` (764 pass / 0 fail / 1 skipped), `release:blockers:report`, `npm audit --omit=dev --audit-level=high`, `seo:week5`, `seo:agentic` and `npm run build` all exit 0. The release decision itself is unchanged and remains **NO-GO**.
