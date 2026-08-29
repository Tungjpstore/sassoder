# LogiVN Full Project Risk Audit And Upgrade Roadmap

Date: 2026-07-22

## 1. Scope And Decision

This audit covers the LogiVN application outside `logimail/`, with emphasis on:

- inventory, purchasing, batches, FEFO and stock accounting;
- staff, roles, permissions, branch scope, attendance, shifts and payroll;
- reservations, table lifecycle, deposits and table QR access;
- dine-in and remote online ordering, delivery, payment and stock reservation;
- database RLS, direct Data API access, migrations, CI and release readiness;
- Git/GitHub history and possible code loss across previous handoffs.

`logimail/` was explicitly excluded. Existing LogiMail work and generated lint reports were not modified or reverted.

Current release decision: **NO-GO**.

The application builds and all executed automated tests pass, but production safety is not demonstrated because one PostgreSQL rehearsal test is skipped and financial RLS, cross-tenant constraints, transactional ordering/reservation flows, branch authorization, payroll correctness, live PostgreSQL rehearsal and recoverable infrastructure backups remain incomplete.

## 2. Verification Evidence

- `npm test`: 753 discovered, 752 passed, 0 failed, 1 skipped after Round 1 regression coverage was added. The skipped test is the reservation PostgreSQL rehearsal because `RESERVATION_DB_URL`/`DATABASE_URL` is unavailable.
- `npx tsc --noEmit --pretty false --incremental false`: pass.
- Targeted ESLint for all Phase 0 files and audited business modules: pass. A broader cross-cutting run reported four non-blocking warnings.
- `NEXT_PRIVATE_BUILD_WORKER=0 npm run build`: pass on Next.js 16.2.6; 160 static pages generated.
- `git diff --check -- . ':(exclude)logimail'`: pass.
- An isolated local Supabase/PostgreSQL 17 rehearsal was attempted on alternate ports. It could not initialize because the Docker VM reported `No space left on device`; existing Supabase projects were not stopped, pruned or modified. Live/staging SQL execution therefore remains a release blocker.
- GreenCloud control-panel inspection was read-only. VPS `logivn-prod-vps-01` was running Ubuntu 24.04.4 with CPU 23.2%, RAM 33.9% (2.61/7.71 GB), 60 GB allocated disk and 33.88/1500 GB bandwidth. The panel did not expose free disk, and its Backups page showed **No backups found** despite a four-week retention setting. No backup, restart, VNC, deploy or configuration action was performed. A verified backup plus restore rehearsal is a release blocker.
- `npm run release:blockers:report`: exits 0 for reporting and returns NO-GO with six automated external blockers: Supabase branch status, Supabase migration dry-run, Supabase backup/PITR status, authenticated QA sign-off, monitoring/alerting sign-off and Staff HR production secrets. These are not the project's complete blocker count; PostgreSQL rehearsal, dependency audit, GreenCloud backup/restore and unresolved P1 findings remain additional blockers.
- `npm run release:blockers:strict`: exits 1 as expected while blockers remain.
- `npm run infra:check`: confirms zero direct LogiVN app service-role violations after the owner lookup was moved behind `services/staff-owner-boundary-service.ts`. The command still exits non-zero for four environment keys used only under the excluded LogiMail area: `LOGIMAIL_E2E_PASSWORD`, `LOGIMAIL_E2E_RETAIN`, `LOGIMAIL_E2E_SECURITY_CODE` and `LOGIMAIL_PLATFORM_ADMIN_EMAILS`.
- `npm audit --audit-level=high`: fails with 33 vulnerabilities: 6 low, 22 moderate and 5 high, including high-severity paths through `sharp`, `fast-uri`, `js-yaml` and `brace-expansion`.

Domain checks also passed locally: inventory 43/43, owner-boundary 7/7, financial DML 4/4, staff/attendance/payroll 109/109, online ordering 146/146, and the reservation/payment source suites after the cron correction. These tests are mostly unit or source-contract tests and do not replace live PostgreSQL concurrency/RLS testing.

## 3. Git And Handoff Integrity

No committed LogiVN code loss was found.

- Local `ui-ux-rebuild/phase-0-tokens` and `origin/ui-ux-rebuild/phase-0-tokens` both point to `aa58f93`; divergence is 0/0.
- The branch contains all of `main` and is 5 commits ahead.
- `origin/codex/p0-production-clean` is already an ancestor of current history.
- The two remote branch heads not present by ancestry are patch-equivalent to commits already merged into current history:
  - `d935157` backup reporting is represented by `fda70e8` and later timer hardening.
  - `c872c2e` storage export is represented by `ff6009d`.
- There are no stashes or tags.
- GitHub has no release tag or GitHub Release for this line, so deployment evidence is SHA-based only; the current branch is five commits ahead of `main` and must be integrated or explicitly promoted before handoff.
- The only unreachable commits, `6409d317` and `3adf3d942`, are pre-amend versions of reachable `0568ac5`; their non-LogiMail trees contain no unique code.

Current handoff risk is uncommitted work, not missing history. The Phase 0 scripts/tests and `supabase/migrations/20260722090000_staff_avatar_rls_private_helper_repair.sql` are not yet on GitHub. A handoff based only on committed diff can omit that forward migration.

There is also route/documentation drift after intentional legacy AI page deletion. For example, `services/ai-morning-brief-service.ts:283` still links to `/dashboard/ai-ops`, and fixtures/docs still mention deleted `/dashboard/ai-growth` or `/dashboard/ai-control` routes.

### 3.1 Local P0 Containment Status

Two forward-only migrations now contain the highest-risk paths locally, but they are not production verified:

- `20260722100000_staff_owner_boundary_hardening.sql` adds canonical `restaurants.owner_user_id`, requires every active tenant to resolve an active ADMIN owner, seeds/reactivates all eight system roles, blocks direct authenticated ownership changes and wraps staff create/profile/state RPCs with owner checks.
- `20260722103000_financial_dml_hardening.sql` revokes direct authenticated writes to orders, bills, payment logs and reservations, adds a same-tenant `(restaurant_id, bill_id)` FK, locks/validates bill recalculation and recreates the bill-sync trigger.

Both migrations still require a PostgreSQL rehearsal against production-like data. Until that evidence exists, the release decision remains NO-GO. Application-level owner helpers are defense-in-depth only: they are not a substitute for actor authorization inside the mutation transaction, recent re-auth/MFA, ownership transfer workflow or real GoTrue session revocation.

### 3.2 Round 1 Live Audit And Local Remediation Status

Round 1 is **in progress**, not signed off.

- A real canonical-owner account opened billing successfully and completed a real profile description save/restore cycle. The QA marker persisted and was then removed; no profile test data remains.
- Three real attempts to create a QA staff account failed without creating a staff row. The production operation ledger recorded `invalid input syntax for type date: ""`; the temporary Auth user was rolled back.
- Root cause: the optional date input submitted an empty string, validation preserved it, and the staff-create RPC received it as a PostgreSQL `date`. Local validation and the server action now normalize blank dates before the database boundary.
- Production also emitted React hydration error `#418`. Local fixes now hydrate operational timers from a serialized server timestamp, defer browser-only attendance queue state until after hydration, bind offline queues to tenant/user keys, serialize same-tab sync, merge queue updates against current storage, and fix Vietnam timezone rendering across staff/settings.
- The timer fix covers dashboard overview, kitchen, orders, online ordering and reservations. Kitchen no longer substitutes a module cache during the first client render.
- Local verification: 752/752 executable tests pass, targeted TypeScript and ESLint pass, and the 160-route production build passes. The PostgreSQL rehearsal remains skipped.
- Post-fix real-account verification is still blocked because these changes are not deployed to a safe preview or production candidate. No deployment, VPS restart or migration apply was performed while the shared VPS lacks backup/restore proof.

Evidence is recorded in `docs/qa-round-1-evidence-2026-07-22.md`. Round 1 cannot close until the deployed candidate is tested with owner, manager, cashier, kitchen and delivery personas and all QA data is reconciled.

### 3.3 Round 2 Local Candidate Real-Account Evidence

Round 2 ran the sanitized Round 1 candidate locally against controlled production QA data. It improves confidence in the narrow fixes but also confirms that release remains **NO-GO**.

- The isolated candidate build passed and differed from the Git index only in the 20 intended hydration/staff-date files. It excluded `logimail/` and both unrehearsed owner/financial migrations.
- A randomly selected active owner created a marked manager through the real staff invitation flow with a blank optional birth date. The row persisted with `date_of_birth=NULL`, proving the local blank-date fix on the real database path.
- The new manager loaded the staff page without React `#418`, but could open the complete subscription billing flow and the editable VietQR receiving-bank form. This is direct real-account confirmation of the owner/billing boundary failure described in section 4.2.
- A public pickup marker order was created through the real customer checkout. A real kitchen account accepted and completed it through the kitchen UI; database state reached `completed`, and no `#418` was observed. The exact order and item were deleted afterward.
- The kitchen UI reported `Mất kết nối` after the successful transition, so websocket/realtime configuration remains an operational blocker.
- A real waiter account was correctly redirected away from billing and admin staff pages, but is blocked by an attendance session left open since 2026-05-19 and a locked device state. Stale attendance recovery is therefore a live operational issue, not only a source-level concern.
- Auth cleanup exposed drift: soft deletion succeeded and public staff/user rows were reconciled, but hard deletion failed with a generic database error, leaving an Auth tombstone. A safe identity cleanup/recovery runbook is required.
- The pickup order cleanup removed the order and child item while retaining the four immutable operational audit rows tied to the exact deleted QA order ID. This is intentional evidence retention, not an unreconciled business row.
- No usable active cashier or delivery account was found, so those persona gates remain open.

Detailed evidence is recorded in `docs/qa-round-2-real-account-evidence-2026-07-22.md`.

## 4. Highest-Risk Findings

### 4.1 P0/P0-Candidate: Financial And Tenant Isolation

The following two findings are P0 if the deployed grants/policies match the repository snapshot. `supabase/schema.sql` is marked as a legacy snapshot, so production must be checked with `pg_policies`, `role_table_grants`, `pg_constraint` and `pg_proc` before asserting live exploitability.

1. Before the local hardening migration, any same-tenant `authenticated` user could update every column of `orders` and `table_bills`, and insert arbitrary `payment_logs`, without application permission, branch, transition or audit enforcement (`supabase/schema.sql:2054`, `supabase/schema.sql:2065`, `supabase/schema.sql:2093`). This can forge paid state, totals, customer data and cancellation without inventory rollback.
2. Before the local hardening migration, cross-tenant bill corruption was possible because `orders.bill_id` was a plain UUID FK and a `SECURITY DEFINER` trigger recalculated a bill by UUID without asserting the same restaurant (`supabase/migrations/20260429113000_table_bills.sql:32`, `supabase/migrations/20260429113000_table_bills.sql:78`, `supabase/migrations/20260429113000_table_bills.sql:124`). The forward migration contains this path locally; live grants/constraints are still unverified.

Required containment:

- revoke direct financial mutation grants from `authenticated`;
- move all financial mutations to permission-aware RPC/service-role paths;
- add composite tenant foreign keys, including `(restaurant_id, bill_id)`;
- enforce monotonic order/payment state transitions and audit/outbox writes in the same transaction;
- run a two-tenant exploit suite against the real staging database.

### 4.2 P0: Owner Takeover And Manager Boundary

1. A manager can self-assign the `owner` role. `updateStaffProfileAction` allows the operation with `staff.edit`/`staff.roles`, and the account mutation RPC blocks self-update only when the target scope is not ADMIN. Manager and owner are both ADMIN-scope, so the protected path explicitly permits this escalation (`app/dashboard/actions/staff.ts:246`, `supabase/migrations/20260618093351_staff_hr_atomic_account_mutations.sql:224`).
2. A manager can create a new owner account that they control. The manager template has staff creation/role permissions, `createStaffAction` accepts `roleCode=owner`, provisioning confirms the Auth email immediately and returns the temporary password (`app/dashboard/actions/staff.ts:180`, `services/restaurant-service.ts:653`).
3. A manager can reset the existing owner's Auth password and receive the temporary password because reset actions require only `staff.edit` and do not exclude owner/ADMIN targets (`app/dashboard/actions/staff.ts:345`, `features/staff/services/staff-app-auth-service.ts:345`).
4. Owner suspension, archive, deletion and profile/role changes are protected only by generic staff permissions or the last-ADMIN count. If another ADMIN exists, a manager can remove or demote the owner (`services/restaurant-service.ts:943`, `services/restaurant-service.ts:968`, `app/dashboard/actions/staff.ts:575`).
5. Owner-only billing/settings boundaries are also bypassed by coarse `session.role=ADMIN` checks. Manager permissions exclude `settings.billing.manage`, but the settings page and subscription payment action accept any ADMIN (`lib/dashboard-access.ts:59`, `app/dashboard/settings/page.tsx:48`, `app/dashboard/actions/billing.ts:9`).
6. The new canonical column would itself be takeoverable without a database guard because the existing restaurant UPDATE policy permits any tenant ADMIN to update the row. A manager could set `owner_user_id` to their own ADMIN user through the Data API. The local migration now blocks non-service-role ownership changes with a column-specific trigger (`supabase/schema.sql:1924`, `supabase/migrations/20260722100000_staff_owner_boundary_hardening.sql`).
7. Owner lifecycle is not integrated with platform suspension/reactivation. Platform admin can reactivate a previously suspended tenant whose owner is unresolved, or block the canonical owner directly, without requiring transfer/recovery (`services/platform-admin-service.ts:1864`, `services/platform-admin-service.ts:1933`). The next owner-only action then fails with no product recovery workflow.

The local owner-hardening migration and service changes contain the first six paths in the current worktree. Residual release risk remains because platform owner lifecycle is incomplete, the service-role RPCs still trust an application-supplied actor ID rather than binding authorization to a user JWT inside the transaction, future onboarding does not atomically provision persistent roles/owner staff membership, ownership transfer and recent re-auth/MFA do not exist, and password reset/force logout do not revoke every GoTrue session.

Required containment:

- prohibit all self role/permission mutation;
- make owner identity immutable except an owner-authenticated break-glass flow with recent re-auth/MFA;
- prevent manager creation, reset, suspension, deletion or demotion of owner accounts;
- stop returning temporary owner credentials to another staff actor;
- replace coarse ADMIN access with explicit permissions and owner-only checks for billing/tenant ownership;
- add negative integration tests proving manager cannot obtain owner authority by create, update, reset, suspend, delete or settings routes.

### 4.3 P1: Online Ordering, Payment And Delivery

1. Order creation is not atomic. The order is inserted before items and payment log (`services/order-service.ts:1286`, `services/order-service.ts:1367`, `services/order-service.ts:1539`, `services/order-service.ts:1633`). A concurrent kitchen accept can move an empty order to `ordering` with no stock deduction.
2. Prepaid online orders do not reserve stock. Stock is allocated only when the merchant accepts (`services/inventory-service.ts:2979`). Two customers can pay for the final item, and the second paid order has no complete refund workflow.
3. Bill/payment concurrency is unsafe. Recalculated SUM can omit a concurrent order; an order can be attached after checkout starts; stale checkout retry can move an already-paid order back to waiting (`supabase/migrations/20260429113000_table_bills.sql:78`, `services/payment-service.ts:414`, `services/payment-service.ts:451`).
4. Delivery fee can be spoofed because client coordinates are trusted independently of the address. Validation accepts delivery without a proper address or with only one coordinate (`lib/validators.ts:137`, `services/order-service.ts:1558`, `services/delivery-service.ts:971`).
5. Order UUID is exposed through VietQR/payment references while realtime topics are broadly readable. A party that learns the UUID may observe payment status or courier location (`lib/vietqr.ts:18`, `supabase/migrations/20260429170000_commercial_security_hardening.sql:10`).
6. QR-only dine-in reads fail open for privacy: when `customerSessionId` is missing, shared-table order sanitization returns full PII rather than redacting it (`lib/customer/public-order-privacy.ts:11`, `services/order-service.ts:1684`, `services/order-service.ts:1764`).
7. Staff APIs are inconsistently permissioned and branch-scoped. The order list and several delivery/kitchen endpoints are feature-only, and cancel lacks `assertStaffCanAccessOrder` (`app/api/admin/orders/route.ts:9`, `app/api/admin/orders/[orderId]/cancel/route.ts:13`).
8. Pickup orders bypass opening hours/temporary close (`services/order-service.ts:1413`, `services/branch-service.ts:274`).
9. Checkout has no signed price/quote lock. Price or fee changes between review and submit can create a higher total without a 409/reconfirmation (`components/customer-v2/remote/remote-client-v2.tsx:779`, `services/order-service.ts:1463`).
10. FREE_ITEM promotion preview does not pass cart lines, so a valid free-item campaign is shown as ineligible (`components/customer-v2/remote/remote-client-v2.tsx:296`, `lib/promotion-discount.ts:43`).

### 4.4 P1: Inventory And Purchasing

1. Inventory page access checks feature entitlement but not inventory permission; tenant-wide supplier, cost and purchase data can be exposed. Page load can also call a service-role helper that creates/reactivates default branch/location (`app/dashboard/inventory/page.tsx:12`, `services/inventory-service.ts:1740`, `services/branch-service.ts:149`).
2. Authenticated ADMIN users retain direct CRUD policies on warehouse, stock, purchase-order, transfer and legacy ingredient tables; the later premium hardening revokes RPC execute but not the table DML (`supabase/migrations/20260516143000_inventory_warehouse_v2_foundation.sql:1158`, `supabase/migrations/20260516143000_inventory_warehouse_v2_foundation.sql:1258`, `supabase/migrations/20260603123221_inventory_premium_foundation_hardening.sql:229`). This lets a caller bypass the stock ledger and create inventory drift; classify as P0 if tenant admins are not fully trusted.
3. Inventory composite tenant/branch relationships are incomplete. `apply_inventory_movement` accepts branch/location identifiers without proving they belong to the same restaurant/branch, and FEFO allocation is restaurant-wide (`supabase/migrations/20260516143000_inventory_warehouse_v2_foundation.sql:496`, `services/inventory-service.ts:1132`).
4. Batchless stock count can create a second non-batch balance containing the aggregate ingredient total while batch balances remain, duplicating inventory (`supabase/migrations/20260516114344_inventory_workflows_v3_operations.sql:193`).
5. Editing `unit` does not migrate or block `base_unit`, quantities or history. Existing 10 kg can silently become 10 g (`services/inventory-service.ts:2664`, `components/dashboard-v2/real/inventory-workspace-v2.tsx:729`).
6. PO receiving has no over-receipt cap or idempotency key; empty target lines can receive every remaining line, and retries can double-add stock. Converted quantity can retain the purchase-unit cost as the stock-unit cost (`supabase/migrations/20260516165316_inventory_po_receiving_v2.sql:68`, `supabase/migrations/20260516165316_inventory_po_receiving_v2.sql:218`).
7. Transfer receive and OCR/Smart Intake are not replay-safe or atomic; partial failures and retries can duplicate stock (`services/inventory-service.ts:2641`, `supabase/migrations/20260516165316_inventory_po_receiving_v2.sql:218`).
8. Advisory locks in count and order-accept RPCs follow caller line order, so reversed multi-line requests can deadlock; no canonical sort/retry contract exists (`supabase/migrations/20260516114344_inventory_workflows_v3_operations.sql:128`, `supabase/migrations/20260519100000_inventory_order_atomicity.sql:278`).
9. Recipe calculation ignores modifier/topping/size inventory and accepts menu items with no recipe as a zero-allocation order (`services/inventory-service.ts:1107`, `services/inventory-service.ts:1126`).
10. Accept retry rebuilds allocations from current stock instead of returning the committed ledger result, and the fail-open fallback can mark an order `ordering` without inventory deduction when RPC/schema is missing (`services/inventory-service.ts:2982`).
11. Test-order deletion can remove completed/ordering rows without rolling back `deduct_sale` movements (`supabase/migrations/20260510210000_order_lifecycle_hardening.sql:75`).

### 4.5 P1: Reservations, Deposits And Table QR

1. Table bearer tokens are sent to `api.qrserver.com` when QR images/posters are generated (`lib/qr-poster.ts:96`, `components/dashboard-v2/real/tables-workspace-v2.tsx:481`). A third party can retain long-lived access tokens.
2. Legacy QR is fail-open for old tables. Public floor data exposes table UUIDs and the server can mint a signed token after tokenless legacy access (`supabase/migrations/20260501090000_admin_real_data_foundation.sql:13`, `services/reservation-service.ts:1921`, `services/table-service.ts:302`).
3. Reservation deposit is recorded on the bill but not subtracted from payable, so a guest can pay a deposit and still be charged the full bill (`services/reservation-service.ts:3455`, `services/payment-service.ts:197`).
4. Expiry, deposit confirmation, seating, cancellation, no-show, move and reschedule are multi-write flows without consistent row locking/CAS. Races can release the wrong lock, create orphan bills or overwrite a newly confirmed state (`services/reservation-service.ts:1068`, `services/reservation-service.ts:1666`, `services/reservation-service.ts:3455`).
5. An expired `waiting_deposit_confirm` reservation does not settle/refund/forfeit the deposit state, leaving money stuck.
6. Reservations have no first-class `branch_id`; multi-table assignment can combine tables from different branches and seating creates a bill only for the first table (`services/reservation-service.ts:1287`, `services/reservation-service.ts:3446`).
7. QR tokens have no short session expiry/replay model; concurrent rotation can write the same next version (`lib/customer/table-qr-access.ts:42`, `services/table-service.ts:361`).
8. Reservation V2 UI has stale local state, timezone drift and action-matrix mismatches with backend transitions (`components/dashboard-v2/real/reservations-workspace-v2.tsx:77`, `components/dashboard-v2/real/reservations-workspace-v2.tsx:94`, `components/dashboard-v2/real/reservations-workspace-v2.tsx:489`).

The lifecycle cron was corrected from daily to every 15 minutes in the current Phase 0 work, but the notification worker remains a stub.

### 4.6 P1: Staff, Roles, Branch Scope And Sessions

1. Temporary staff credentials use normal Supabase Auth, but the first-password-change check exists only on the mobile page. Staff can use `/dashboard/login` and deep-link to another permitted dashboard route without changing the temporary password (`app/dashboard/actions/auth.ts:68`, `app/dashboard/staff/mobile/page.tsx:44`).
2. Staff heartbeat accepts an arbitrary validated branch ID without `assertStaffCanAccessBranch`, contaminating branch presence/device trust (`features/staff/services/staff-session-service.ts:170`).
3. Effective permission is a union of role grants and stale per-account `users.permissions`. Removing a role permission may leave it effective (`services/staff-permission-service.ts:173`).
4. Empty permission sets fall back to broad templates, so an intentional deny-all role is impossible and schema drift fails open (`services/staff-permission-service.ts:124`, `features/roles/services/role-service.ts:104`).
5. ADMIN sessions bypass explicit permission checks, and custom ADMIN roles receive an additive manager permission floor. A restricted branch-manager matrix in UI is not actually restrictive (`lib/dashboard-access.ts:47`, `services/staff-permission-service.ts:58`).
6. `staff.edit` can assign another user to any STAFF-scope custom role, even if that role contains `staff.roles`, refund or inventory-management permissions. Role assignment needs grant-dominance checks (`app/dashboard/actions/staff.ts:246`, `services/staff-permission-service.ts:212`).
7. Payroll money actions all use generic `staff.edit`; there is no separation between profile setup, payroll generation, review, closing and marking paid (`app/dashboard/actions/staff.ts:1284`).
8. Staff contracts, salary documents, devices and reviews are directly readable tenant-wide by authenticated users under current migration policies, regardless of HR permission (`supabase/migrations/20260516103000_staff_admin_workflows.sql:100`, `supabase/migrations/20260516113000_staff_admin_workflows_completion.sql:8`).
9. Staff page loads tenant-wide HR, payroll, devices and contracts with no branch filtering. ADMIN bypass makes a branch manager able to view/export every branch (`app/dashboard/staff/page.tsx:14`, `features/staff/services/staff-operations-service.ts:742`).
10. Future shift assignments immediately add a branch to authorized branch IDs, rather than only during the active shift (`features/staff/services/staff-branch-authorization-service.ts:40`).
11. An ADMIN session with no `staff_members` row receives unrestricted branch access, so identity/profile drift bypasses branch isolation entirely (`features/staff/services/staff-branch-authorization-service.ts:35`).
12. Updating a profile without `branchId` silently assigns the default branch instead of preserving the current branch (`lib/validators.ts:1000`, `services/restaurant-service.ts:779`).
13. Role permission update/clone is a sequence of service-role writes without transaction, CAS or idempotency. Partial failure can leave an empty role which then expands to a broad template (`features/roles/services/role-service.ts:135`, `features/roles/services/role-service.ts:240`).
14. Force logout/suspension protects the app session but may not revoke GoTrue refresh/access tokens; RLS helpers do not check account/employment/archive status (`supabase/migrations/20260613170000_inventory_actor_scope_jwt_role_fix.sql:31`, `features/staff/services/staff-session-service.ts:374`).
15. Session and RLS identity lookup can fall back to email when Auth user ID does not match. Recreating an Auth account with the same email as a stale `users` row can inherit the old tenant and ADMIN role (`lib/session.ts:98`, `supabase/migrations/20260613170000_inventory_actor_scope_jwt_role_fix.sql:13`).
16. Staff mobile module groups unlock multiple links from one permission, so custom roles see links outside the actual grant (`features/staff/components/staff-mobile-redesign-workspace.tsx:1371`).
17. The always-visible mobile Home tab shapes order/payment totals and identifiers before checking `orders.view`/`payments.view`; only action buttons are hidden. An attendance-only user can still see branch orders, totals and payment methods (`features/staff/services/staff-operations-service.ts:442`, `features/staff/services/staff-operations-service.ts:466`).
18. Dashboard pages commonly check only feature entitlement, not the granular permission, so a staff member who knows a URL can deep-link into kitchen, inventory, payments, tables, orders, online, reservations or reports (`features/staff/components/staff-mobile-redesign-workspace.tsx:1380`, `app/dashboard/inventory/page.tsx:12`).
19. The mandatory-password-change gate skips every ADMIN and fails open when the staff member lookup errors or returns no row. A manager/custom ADMIN can continue using a temporary credential indefinitely (`features/staff/services/staff-app-auth-service.ts:266`).
20. Leave/overtime and shift-swap requests trust caller-supplied same-tenant branch/target identifiers without proving active branch assignment or target compatibility (`features/staff/services/staff-request-service.ts:275`, `features/staff/services/staff-request-service.ts:425`).
21. Manual attendance management treats any ADMIN as authorized and can clock arbitrary staff at arbitrary active branches, compounding the coarse ADMIN bypass (`features/attendance/services/attendance-service.ts:38`, `features/attendance/services/attendance-service.ts:737`).
22. The self/mobile staff operations bundle can include unassigned device inventory and fingerprints for attendance-only users because unassigned devices survive the self-scope filter (`features/staff/services/staff-operations-service.ts:736`, `features/staff/services/staff-operations-service.ts:901`).
23. Shift create/update/assignment accepts branch and staff identifiers without proving the branch belongs to the restaurant or the staff member is actively assigned to that branch (`features/shifts/services/shift-service.ts:118`, `features/shifts/services/shift-service.ts:516`, `features/shifts/services/shift-service.ts:628`).
24. The service-request resolve endpoint checks feature and branch access but no operation permission, so a branch-visible user can resolve staff calls without a dedicated grant (`app/api/admin/service-requests/[requestId]/resolve/route.ts:13`).
25. Payroll reads, generation and RLS are tenant-wide for raw ADMIN accounts, while all money mutations share `staff.edit`; branch managers can see or mutate another branch payroll and there is no maker-checker permission split (`features/staff/services/staff-payroll-service.ts:63`, `app/dashboard/actions/staff.ts:1284`, `supabase/migrations/20260619090000_staff_payroll_periods.sql:201`).
26. Staff/payroll/RLS suites mainly assert source strings and policy presence. The current 752 passing tests do not prove manager-A/branch-B denial, concurrent payroll regeneration safety or database authorization behavior.

### 4.7 P1: Attendance, Shifts And Payroll Correctness

1. Payroll base pay uses all `work_minutes`, then adds all `overtime_minutes` at the full multiplier. If work minutes already include overtime, OT is paid twice (`features/staff/services/staff-payroll-service.ts:619`).
2. Approved overtime requests and paid leave are included in operational summaries but not in payslip generation. The payroll query reads only attendance logs (`features/staff/services/staff-payroll-service.ts:229`), while request-derived values are computed elsewhere (`features/staff/services/staff-operations-service.ts:1248`).
3. Monthly `baseSalary` is used only as the insurance base; gross pay is always hourly attendance. Staff with a monthly salary and no attendance row can receive no payslip (`features/staff/services/staff-payroll-service.ts:258`, `features/staff/services/staff-payroll-service.ts:623`).
4. Regenerating a non-closed period upserts the period, deletes payslips and reinserts them in separate calls. Failure can erase review state or leave an empty period (`features/staff/services/staff-payroll-service.ts:307`).
5. Approval aggregation and operational side effects are not one transaction; one approval can move attendance into payroll while another blocker is still pending.
6. QR advertised as rotating expires quickly but is not automatically regenerated; QR consumption can happen before attendance commit, so a failed attendance write consumes the token.
7. Cold offline launch cannot queue an attendance action; shift `confirmed/completed` lifecycle and PIN transition remain incomplete.

## 5. P2 And Incomplete Areas

- Inventory CRUD is incomplete for conversions, SKU/barcode, supplier item defaults, PO approval/cancel, invoice, shipping/discount and complete batch traceability.
- Low-stock alert aggregates per batch instead of per ingredient/location and can recreate dismissed alerts.
- Reservation and inventory VPS workers return `processed: true` without performing the business operation. Order/payment workers are also stubs; several AI worker adapters throw `*_adapter_not_configured`.
- Reservation notification outbox marks some messages sent without a real consumer.
- Remote customer sessions are bare UUID bearer tokens without TTL, stored with PII/GPS in localStorage and transmitted in query strings.
- QR countdown, loyalty and ratings are UI-only or do not have an enforceable backend contract.
- Remote order accounting lacks stable subtotal/tax/VAT snapshots; modifier absolute-price and database constraints disagree.
- Release QA/monitoring evidence is stale, Vercel project lookup is unavailable, and Supabase branch/dry-run/backup commands return 403.
- GreenCloud VPS backup retention is configured, but the control panel reports `No backups found`; allocated disk is visible while free disk and restore viability are not.
- The strict GitHub release step requires a signoff containing the exact current SHA from a committed file. A practical external signoff/evidence injection path is still needed so the gate can eventually pass without a self-referential commit.
- Dependency audit remains red with five high-severity vulnerabilities.
- Future restaurant onboarding sets the canonical owner from `trial_claims` but does not atomically provision persistent system roles, role permissions or the owner's `staff_members` profile (`supabase/migrations/20260517160000_atomic_restaurant_onboarding_rpc.sql:298`). The zero-role fallback returns role codes as synthetic IDs (`features/staff/services/staff-operations-service.ts:966`), while role edit/clone requires database UUIDs (`lib/validators.ts:1043`), so Premium role matrix save/clone fails for a fresh tenant.
- The P0 migrations depend on exact historical RPC signatures and use blocking index/constraint/FK validation without `lock_timeout` or `statement_timeout`. Remote history drift can abort deployment, while production-scale tables can hold disruptive locks; staging rehearsal and a maintenance-window/fix-forward runbook are mandatory.

## 6. Upgrade Roadmap

### Phase 0 - Containment And Evidence

Goal: prevent unauthorized financial/PII mutation and make the real production state observable.

Current status: canonical owner and financial DML containment are implemented locally and source-contract tested. PostgreSQL apply/rehearsal, inventory/HR/tracking DML revocation, QR containment, dependency remediation and session revocation remain open.

1. Query production `pg_policies`, grants, functions and constraints; archive signed output as release evidence.
2. Block manager-to-owner escalation across create, self-update, password reset, suspend, delete, settings and billing flows.
3. Revoke direct authenticated mutation on financial, reservation, HR document and tracking tables.
4. Add composite tenant foreign keys and tenant checks to all `SECURITY DEFINER` functions/triggers.
5. Disable legacy QR bootstrap, stop sending bearer QR URLs to third parties and rotate all table tokens.
6. Enforce suspended/archived/employment status at RLS and revoke GoTrue sessions during force logout.
7. Patch high dependency vulnerabilities without `--force`; isolate breaking upgrades into tested changes.
8. Protect the untracked avatar RLS repair migration and all Phase 0 scripts in a reviewed branch/commit.
9. Create a recoverable GreenCloud VPS backup without disrupting concurrent workloads, then restore it to an isolated target and retain dated evidence.

Acceptance criteria:

- two-tenant SQL exploit attempts for order, bill, reservation, tracking and HR documents all fail;
- manager cannot create, become, reset, demote, suspend or delete owner and cannot access owner-only billing;
- viewer/kitchen/delivery roles cannot mutate financial state through Supabase Data API;
- old QR links fail and new QR generation remains fully first-party;
- suspended user access and refresh tokens fail within the agreed revocation window;
- `npm audit --audit-level=high` is green or every residual advisory has a documented, time-bounded exception.
- VPS and database backup artifacts exist, are encrypted/access-controlled, and have a successful isolated restore rehearsal.

### Phase 1 - Transactional Order, Bill And Payment Core

Goal: one committed business action produces one consistent financial state.

1. Implement transaction RPCs for order creation, bill checkout and payment transition.
2. Include order, items, modifiers, promotion usage, payment log, inventory reservation and outbox in the same transaction.
3. Add idempotency fingerprint, row locks and CAS/monotonic transition guards.
4. Make customer sessions expiring, signed and redacted-by-default; authorize private realtime topics with the same session.
5. Add signed quote/menu version/expected total and return 409 when the reviewed price is stale.
6. Canonicalize delivery address and coordinate pair server-side; reject mismatched or incomplete destination data.

Acceptance criteria:

- crash injection after every write leaves no orphan order/bill/log;
- two simultaneous orders cannot lose bill total or regress paid state;
- missing/mismatched customer session never returns another customer's PII;
- price/fee changes require customer reconfirmation;
- forged delivery coordinates cannot reduce the approved fee.

### Phase 2 - Inventory Ledger And Reservation

Goal: stock, batch, branch and reservation money remain correct under retry/concurrency.

1. Reserve stock for prepaid orders; consume on accept; release on cancel, expiry or payment timeout.
2. Make FEFO branch/location aware and retries return the committed ledger result.
3. Define recipe-required policy and inventory recipes for modifiers/toppings/sizes.
4. Normalize quantity and cost conversion; block unsafe unit changes and repair PO receiving cost.
5. Make count, transfer, PO receipt and OCR intake transaction/idempotency safe.
6. Implement reservation RPCs for create+lock, confirm/expire deposit, seat, cancel, no-show, move and reschedule.
7. Add reservation `branch_id`, same-branch table constraints and a defined multi-table bill model.
8. Apply deposits to net payable and provide explicit refund/forfeit/carry-forward transitions.

Acceptance criteria:

- competing prepaid orders cannot oversell a batch;
- branch A never deducts branch B stock without a transfer;
- unit/cost conversion tests reconcile quantity and valuation exactly;
- every reservation transition is atomic, retry-safe and CAS-protected;
- deposits reconcile to bill payable and settlement ledger.

### Phase 3 - Staff Authorization, Attendance And Payroll

Goal: every role sees and changes only the right branch/domain, and payroll is reproducible.

1. Remove coarse ADMIN bypass; keep owner break-glass separate from custom manager roles.
2. Define explicit empty grants and fail-closed permission/schema behavior.
3. Add grant-dominance checks, transactional role update/clone and stale account-grant cleanup.
4. Add payroll-specific permissions and maker-checker separation for close/pay actions.
5. Enforce branch scope on pages, APIs, exports, heartbeat and staff mobile links.
6. Enforce first-password change centrally and remove email-based identity inheritance.
7. Choose hourly vs monthly payroll rules; split regular and OT minutes; integrate approved OT and paid leave.
8. Generate/regenerate payroll through one transaction with snapshot versioning and immutable closed periods.
9. Put QR consume and attendance write in one RPC; add real rotation and an explicit offline policy.

Acceptance criteria:

- a role/branch matrix test proves every positive and negative page/API/Data API permission;
- removing a permission removes it immediately from effective access;
- a branch manager cannot read/export another branch HR/payroll data;
- monthly, hourly, OT, paid leave, no-attendance and multi-approval payroll fixtures produce agreed totals;
- force logout, password-change gate and identity recreation tests fail closed.

### Phase 4 - Product Completion And Operations

Goal: remove misleading UI and replace stub infrastructure with real observable workflows.

1. Complete worker implementations for order, payment, inventory, reservation and configured AI tasks.
2. Add notification delivery consumers, retries, dead-letter handling and operator dashboards.
3. Fix reservation state/timezone/realtime/cache UI contracts.
4. Finish pickup hours, FREE_ITEM, subtotal/tax, loyalty/rating or remove unfinished promises from UI.
5. Complete warehouse CRUD/pagination and replace untyped Supabase access with generated types.
6. Remove stale AI route links and update runbooks/docs to current dashboard routes.

Acceptance criteria:

- no production worker acknowledges a job without a durable side effect or explicit retry/dead-letter state;
- UI state and backend state machine share one tested action matrix;
- every advertised feature has a persisted backend contract or is hidden;
- operational dashboards expose queue lag, error rate, payment mismatch, stock mismatch and cron freshness.

### Phase 5 - Release Rehearsal And Rollout

Goal: demonstrate production safety before traffic promotion.

1. Apply migrations to an isolated Supabase branch/staging project using production-like data volume.
2. Run two-tenant RLS attacks, PostgreSQL concurrency barriers and crash-injection tests.
3. Run authenticated browser E2E for owner, manager, cashier, kitchen, waiter, delivery and employee mobile roles.
4. Rehearse Supabase backup/PITR and GreenCloud VPS restore, forward repair and application rollback compatibility.
5. Replace stale QA signoff with external evidence bound to candidate SHA, branch, migration count and date.
6. Deploy canary, watch the first hour with real alerts, and expand only if payment/stock/auth metrics remain within thresholds.

Release GO criteria:

- no open P0/P1 financial, tenant-isolation, QR, payroll or branch-scope finding;
- full unit/type/lint/build/audit gates green;
- live PostgreSQL RLS/concurrency suite green;
- authenticated role E2E green;
- migration dry-run, backup/PITR and rollback evidence current;
- monitoring owner and durable alert routes confirmed;
- release artifact clean, committed and reproducible from GitHub.
