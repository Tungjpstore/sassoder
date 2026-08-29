# LogiVN Real-Account Audit Protocol

Date established: 2026-07-22

## 1. Mandatory Gate For Every Upgrade Round

An upgrade round is not complete until all of the following evidence exists:

1. The candidate commit or working-tree digest is recorded before testing.
2. Automated unit, type, lint and production-build checks pass.
3. Database migration, RLS and concurrency checks run on an isolated database using production-like data.
4. A real authenticated account exercises the changed workflow through the same UI/API used in production.
5. Positive and negative role checks run for every affected role and branch boundary.
6. Before/after database state, visible UI result and server error/log result are captured.
7. Test data is cleaned up or retained with an explicit owner and expiry date.
8. Rollback or fix-forward steps are proven before the round is accepted.

Source/regex tests are supporting evidence only. They cannot satisfy the real-account or PostgreSQL gates.

## 2. Safety Boundaries

- Never use an operating restaurant as the mutation target. Use a dedicated QA tenant and QA branches only.
- Prefix mutable test records with `QA-R<round>-<timestamp>` so they can be located and removed safely.
- Do not use real customer phone numbers, addresses, GPS coordinates, bank accounts, payroll values or employee documents.
- Do not send real money, email, SMS, Telegram or push notifications unless that exact external delivery is the test target and is approved at action time.
- Do not change the canonical owner, suspend an owner, rotate production QR tokens, apply production migrations, restart services or restore backups as an incidental test step.
- Never test destructive cleanup with broad filters. Resolve and record exact tenant and row IDs before deletion.
- Do not read, modify or use the separate `logimail/` worktree or its accounts.

## 3. Required Account And Tenant Set

Each affected workflow must be tested with real Supabase Auth sessions for the smallest relevant set:

| Persona | Required proof |
| --- | --- |
| Canonical owner | Owner-only action succeeds; owner identity and billing boundary remain intact. |
| Manager | Ordinary management action succeeds; owner/billing/security escalation fails. |
| Cashier | Payment/table operations follow explicit grants and branch scope. |
| Waiter | Dine-in/table operations work without financial or HR access. |
| Kitchen | Kitchen lifecycle works without price/payment/customer-PII mutation. |
| Delivery | Assigned delivery flow works without cross-order or cross-branch access. |
| Employee | Attendance/self-service works without tenant-wide HR/order/payment visibility. |
| Customer | Dine-in, reservation or remote-order session sees only its own data. |

At least two QA branches and, for RLS rounds, two QA tenants are required to prove negative isolation.

## 4. Evidence Record

Create one evidence entry per tested action:

```text
Round:
Candidate SHA / worktree digest:
Environment:
Account persona:
Tenant and branch IDs:
Action:
Expected result:
Observed UI result:
Observed HTTP/API result:
Before database state:
After database state:
Audit/log event:
Cleanup result:
Pass / Fail / Blocked:
```

Emails, tokens, passwords, cookies, bank details and customer PII must be redacted from reports.

## 5. Round 1 - Owner And Financial Boundary

### Implementation scope

- Rehearse `20260722100000_staff_owner_boundary_hardening.sql` and `20260722103000_financial_dml_hardening.sql` on an isolated PostgreSQL database.
- Verify owner backfill, role provisioning, direct DML revocation, same-tenant bill FK and bill recalculation trigger behavior.
- Keep service-role access behind service modules for billing, VietQR and settings reads.
- Add missing PostgreSQL integration tests for two-tenant RLS and concurrent order/bill mutations.

### Real-account actions

1. Owner opens billing and receiving-bank settings successfully.
2. Manager opens ordinary settings but is denied billing, receiving-bank and owner-account mutations.
3. Manager attempts to create, assign, reset, suspend and demote an owner account; every attempt must fail without partial writes.
4. Cashier completes an allowed QA payment transition through the UI.
5. Cashier, kitchen and delivery accounts attempt direct financial mutations; every attempt must fail.
6. Two tenants attempt to link an order to the other tenant's bill; the database must reject it.
7. Retry and concurrent payment transitions preserve one monotonic final state and one idempotent audit trail.

### Acceptance criteria

- No account can obtain canonical-owner authority through role, profile, password or account-state mutations.
- Direct authenticated DML cannot change order totals, paid state, bill totals or payment logs.
- Cross-tenant order-to-bill links fail at the database constraint and trigger layers.
- All successful mutations produce a tenant-scoped audit record.
- The previous application version can read the migrated schema during rollback evaluation.
- Real-account evidence is complete for every listed persona and all QA rows are reconciled.

## 6. Production Promotion Rule

Production remains NO-GO after a successful functional round unless backup/PITR, isolated restore, monitoring and rollback evidence are also current. A passing real-account test never overrides a failed migration, security, backup or dependency gate.
