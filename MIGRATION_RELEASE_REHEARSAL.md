# Migration Release Rehearsal - LogiVN

## Phase 2 Addendum - Inventory Reservation Ledger

Target migration: `20260903100000_phase2_inventory_reservation_ledger.sql`

Required fix-forward migration: `20260903103000_phase2_inventory_reservation_scope_fix.sql`

Run against an isolated PostgreSQL/Supabase database after Phase 1:

```bash
RESERVATION_DB_REHEARSAL_REQUIRED=true RESERVATION_DB_URL="$STAGING_DATABASE_URL" npm test
```

Required database scenarios:

- Two prepaid orders competing for the final batch: one reservation succeeds and the other fails without negative stock.
- Retrying the same order returns the existing reservation without increasing `reserved_quantity`.
- Acceptance consumes the reservation exactly once; cancellation releases it exactly once.
- A branch-A order cannot reserve or consume branch-B stock; a null-branch order only uses null-branch stock.
- Direct reservation rows with a restaurant or branch that differs from the order are rejected by `inventory_reservations_scope_guard`.
- `reserved_quantity` never exceeds `on_hand_quantity` and all reserve/release/consume movements retain the order source ID.

Read-only checks:

```sql
select routine_name, security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in ('reserve_order_inventory', 'consume_order_inventory', 'release_order_inventory', 'accept_order_with_reserved_inventory');

select status, count(*)
from public.inventory_reservations
group by status
order by status;

select routine_name, security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name = 'cancel_order_with_inventory_reservation_rollback';
```

Rollback is fix-forward: keep the additive RPCs and disable prepaid reservation wiring per tenant until concurrency evidence is complete. Do not drop ledger rows or rewrite existing movement history.

## Phase 1 Addendum - 2026-09-03

Target migration: `20260903090000_phase1_security_transaction_hardening.sql`

Run the rehearsal against an isolated PostgreSQL/Supabase staging database after the complete ordered migration set has been applied:

```bash
RESERVATION_DB_REHEARSAL_REQUIRED=true RESERVATION_DB_URL="$STAGING_DATABASE_URL" npm test
```

The rehearsal now verifies:

- reservation + table lock persistence through `create_reservation_with_lock`;
- order + item persistence through `create_order_with_items_atomic`;
- authenticated inventory `INSERT/UPDATE/DELETE` grants are revoked;
- existing cross-tenant reservation and branch guards remain active.

Additional read-only checks:

```sql
select routine_name, security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in ('create_reservation_with_lock', 'create_order_with_items_atomic');

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_name in ('stock_balances', 'inventory_batches', 'purchase_orders')
order by table_name, privilege_type;

select conname, convalidated
from pg_constraint
where conname in ('tables_restaurant_branch_id_fkey', 'orders_restaurant_branch_id_fkey');
```

Expected result: both RPCs exist as `SECURITY DEFINER`, no authenticated inventory write grants are returned, and both composite foreign keys are validated. Do not apply this migration to production until these checks and backup/restore evidence are recorded in `MIGRATION_LOG.md`.

## 2026-05-29 Refresh

Status: no current pending migration apply according to Supabase dry-run.

Evidence from `npm run release:blockers`:

- 108 local SQL migration files exist; latest is `20260529105500_staff_attendance_daily_qr_wifi.sql`.
- No duplicate migration versions were found locally.
- `supabase db push --dry-run --linked --yes` returned `Remote database is up to date`.
- Only the default Supabase branch exists, so this project still lacks a non-production branch for future rehearsal.
- Backup/PITR proof is still blocked: `pitr_enabled=false`, `backups=[]`. Docker is now reachable and a schema-only dump exists at `reports/release/pre-release-schema-20260529T105852Z.sql`, but full data rollback proof is still missing.

Release rule: do not use the historical 16-file `20260519*` pending batch below as a current apply list. It is now a historical audit target. For the next migration batch, create a staging branch/project or another isolated rehearsal environment before production apply, then paste the new evidence into `MIGRATION_LOG.md`.

Date: 2026-05-20
Status: required before Conditional GO
Scope: pending Supabase migration batch from `20260519090000` through `20260519201100`

## Commander Rule

Do not apply this batch to production until the same ordered batch has passed staging rehearsal, backup proof exists, and the release artifact is clean.

## Current Known State

| Item | Status |
| --- | --- |
| Local SQL migration files | 98 |
| Git-tracked SQL migration files | 98 |
| Untracked SQL migration files | 0 |
| Local branch | `codex/p0-production-clean` |
| Branch relationship | Ahead of upstream by 2 commits, behind by 0 |
| Pending batch | `20260519090000` through `20260519201100` |
| Special blocker | `20260519120000_billing_webhook_idempotency.sql` creates a regular unique partial index; verify no duplicate request signatures before apply |

## Pre-Rehearsal Entry Criteria

All items must be true before staging apply:

| Gate | Required Evidence |
| --- | --- |
| Release artifact chosen | Commit SHA and branch recorded. |
| Worktree controlled | No unrelated staged, unstaged or untracked files. |
| Migration files tracked | Every intended SQL file is committed/tracked. |
| Migration history captured | `supabase migration list --linked` output saved. |
| Backup captured | Staging backup or restore point recorded. |
| Billing idempotency index decision | `20260519120000` is proven safe on staging and duplicate `request_signature` rows are absent. |

## Ordered Pending Batch

Apply only in timestamp order:

| Order | Migration | Rehearsal Focus |
| --- | --- | --- |
| 1 | `20260519090000_reservation_realtime_publication.sql` | Realtime publication membership. |
| 2 | `20260519092131_restrict_public_store_branch_reads.sql` | Public branch read isolation. |
| 3 | `20260519100000_inventory_order_atomicity.sql` | Order/inventory atomic RPCs. |
| 4 | `20260519101000_promotion_identity_timezone.sql` | Promotion usage identity and timezone behavior. |
| 5 | `20260519102000_inventory_stale_stock_alert.sql` | Inventory alert constraints. |
| 6 | `20260519103000_staff_operations_security_hardening.sql` | Staff RLS and attendance writes. |
| 7 | `20260519103500_promotion_free_item_rewards.sql` | Free-item promotion reward constraints. |
| 8 | `20260519110000_reservation_tenant_integrity_guards.sql` | Reservation/table bill tenant integrity. |
| 9 | `20260519112000_reservation_reminder_dedupe.sql` | Reminder idempotency. |
| 10 | `20260519114500_ai_owner_agent_approval_tokens.sql` | Service-role-only approval tokens. |
| 11 | `20260519115000_ai_security_events.sql` | AI security event isolation. |
| 12 | `20260519115500_ai_conversation_actor_scope.sql` | AI conversation actor scoping. |
| 13 | `20260519120000_billing_webhook_idempotency.sql` | Unique partial index apply behavior. |
| 14 | `20260519190000_platform_admin_governance_hardening.sql` | Platform admin RBAC. |
| 15 | `20260519201000_dashboard_operations_realtime_publication.sql` | Dashboard realtime publication membership. |
| 16 | `20260519201100_users_lower_email_lookup_idx.sql` | Lowercase email lookup index. |

## Staging Commands

Run from the finalized release artifact:

```bash
git status --short --branch
git diff --check
git diff --cached --check
npm run infra:check
supabase migration list --linked
```

Then apply to staging using the approved Supabase staging project procedure. Record exact CLI version, project ref, command output, start time, end time and operator.

## Validation SQL

Run these read-only checks after staging apply and paste the results into `MIGRATION_LOG.md`.

```sql
select version, name, executed_at
from supabase_migrations.schema_migrations
where version between '20260519090000' and '20260519201100'
order by version;
```

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'reservation_table_locks',
    'tables',
    'table_bills',
    'orders',
    'order_items',
    'inventory_items',
    'inventory_movements',
    'reservation_notification_outbox'
  )
order by tablename;
```

```sql
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'store_branches',
    'staff_roles',
    'staff_members',
    'staff_branch_assignments',
    'attendance_logs',
    'attendance_approval_requests',
    'staff_sessions',
    'ai_owner_agent_approval_tokens',
    'ai_security_events'
  )
order by tablename, policyname;
```

```sql
select indexname, tablename, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'billing_payment_logs_request_signature_idx',
    'users_lower_email_idx'
  )
order by indexname;
```

```sql
select routine_name, security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in (
    'apply_order_inventory_movement_atomic',
    'accept_order_with_inventory_deduction',
    'cancel_order_with_inventory_rollback',
    'enforce_restaurant_scoped_table_assignment'
  )
order by routine_name;
```

## Functional Staging Smoke

| Flow | Required Result |
| --- | --- |
| Owner login and dashboard load | Authenticated owner reaches dashboard without RLS errors. |
| Staff attendance QR/device trust | Valid staff flow succeeds; unauthorized role is blocked. |
| QR dine-in order accept/cancel | Inventory movement is atomic and idempotent. |
| Remote pickup/delivery checkout | Branch lookup and quote flow work without anon-wide branch reads. |
| Reservation create/cancel/reminder | Tenant guard and reminder dedupe both behave correctly. |
| Billing webhook replay | Duplicate webhook request is ignored or idempotent. |
| Platform admin scoped mutation | Admin role cannot exceed assigned permission scope. |
| AI owner approval token | Token create/consume path is service-role-only. |

## Exit Criteria

The migration batch can move from P0 blocker to Conditional GO only when:

1. Staging apply completes without manual SQL edits.
2. All validation SQL returns expected rows.
3. Functional smoke passes for the flows above.
4. Backup/PITR evidence is attached.
5. `MIGRATION_LOG.md` is updated with output and operator sign-off.
6. `ROLLBACK_PLAN.md` references any migration-specific recovery note discovered during rehearsal.

## Abort Criteria

Abort the release if:

- any migration applies out of order,
- any intended migration file is still untracked,
- billing webhook unique index fails in the runner,
- RLS checks show unintended anon/authenticated access,
- tenant-crossing writes succeed,
- billing duplicate webhook protection cannot be proven,
- staging smoke requires manual data repair not captured as a migration.
