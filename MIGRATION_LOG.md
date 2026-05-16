# LogiVN Migration Log

Last updated: 2026-05-17

## Current Snapshot

- Tracked migration files: 60
- Current integration branch: `codex/p0-production-clean`
- Current release commit: `531a181 chore: consolidate LogiVN production release`
- Working tree status during snapshot: clean

## Latest Migration Files

| Migration | Area | Risk |
| --- | --- | --- |
| `20260516165000_platform_admin_rbac_foundation.sql` | Platform admin RBAC | High: auth, sessions, permissions, audit logs. |
| `20260516143000_inventory_warehouse_v2_foundation.sql` | Inventory warehouse v2 | High: inventory schema, functions, triggers, policies. |
| `20260516114344_inventory_workflows_v3_operations.sql` | Inventory operations | Medium-high: operational workflows. |
| `20260516114343_reservation_table_operations_foundation.sql` | Reservation/table operations | Medium-high: booking and table operations. |
| `20260516113906_staff_request_workflows.sql` | Staff requests | Medium: staff operational flows. |
| `20260516113655_cron_run_logs_observability.sql` | Cron observability | Medium: operational logging. |
| `20260516113000_staff_attendance_default_clock_and_contract_templates.sql` | Staff attendance/contracts | Medium: staff workflows. |
| `20260516103000_staff_admin_workflows.sql` | Staff admin | High: staff management and RLS. |
| `20260516093717_ai_operation_insights_lifecycle.sql` | AI operation insights | Medium: AI ops lifecycle. |

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
npm run lint
npx tsc --noEmit --pretty false --incremental false
npm test
```

## Open Follow-Ups

- Add Supabase staging apply notes after the next migration rehearsal.
- Add production rollback notes for platform admin RBAC.
- Confirm whether inventory warehouse v2 migrations need seed or backfill steps.
