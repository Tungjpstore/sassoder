# Phase 1-5 Local Completion Evidence

Date: 2026-07-23
Candidate branch: `codex/phase1-5-20260722`
Production decision: **NO-GO**

## Safety Boundary

- All changes and database rehearsals were performed in the isolated worktree or disposable PostgreSQL containers.
- No production Supabase, Vercel project, Cloudflare deployment, shared VPS process, or real restaurant data was changed.
- Files explicitly reserved for the separate task were not edited during this continuation.
- There is no real restaurant or complete live role matrix, so this round does not claim real-account QA.

## Phase 1 - Orders And Payments

Implemented locally:

- Dine-in and remote order creation use the tenant-scoped `create_online_order_atomic` RPC.
- Bill checkout and payment transitions use row locks, state-version compare-and-swap and request fingerprints.
- Canonical cancellation locks the bill before orders, prevents late order attachment, rejects prepared-order cancellation and writes payment log, audit and outbox rows atomically.
- Remote/dine-in idempotency replay does not repeat notification or realtime side effects.
- Payment outbox events use a deterministic representative order and include all bill order IDs.

Database evidence:

- PostgreSQL 17 transaction rehearsal: `phase1_rehearsal_ok`.
- Concurrent duplicate create/checkout: `phase1_concurrency_ok`.
- Deadlock and attach-race regression: `phase1_canonical_deadlock_ok`, `phase1_canonical_attach_race_ok`, `phase1_canonical_invariants_ok`.

Residual work:

- Reconcile the exact remote migration history and production schema before applying any Phase 1 migration.
- Add authenticated preview tests for terminal payment/delivery retries and customer notification delivery.

## Phase 2 - Inventory And Procurement

Implemented locally:

- Inventory writes are tenant/branch/location constrained; browser-side direct mutations fail closed.
- Purchasing, receiving, stock counts and transfers use fingerprinted atomic RPCs.
- Prepaid QR orders reserve stock by FEFO, consume on paid and release on cancellation in the same database transaction.
- Existing dine-in orders now reserve stock when checkout moves them into `waiting_payment`, not only when a remote prepaid order is inserted.
- Reservation allocation locks stock balances deterministically and does not lock the nullable side of the batch outer join.

Database evidence:

- Phase 2 migration applied on isolated Supabase PostgreSQL 17 after loading its historical prerequisites.
- Runtime reserve/consume/release passed FEFO, branch isolation, shortage rollback, idempotency and legacy-order guards.
- Two orders racing for five units produced one four-unit reservation and one shortage rollback; reserved stock never exceeded physical stock.
- The rehearsal reproduced and fixed the nullable outer-join lock failure.
- Focused stock and procurement contracts pass.

Residual work:

- Define and implement modifier-to-ingredient recipes; current reservations cover base menu recipes only.
- Rehearse the complete historical migration chain against a production-like schema. The legacy `schema.sql` snapshot is not a sufficient bootstrap and is missing historical billing, HR and inventory prerequisites.
- Run concurrent purchasing/receiving/count/transfer tests on a fresh full schema and verify recipe-less restaurant policy.

## Phase 3 - Reservations, Table QR And Customer Sessions

Implemented locally:

- QR rotation/disable is atomic and existing rows are backfilled to signed QR requirements.
- Dine-in history is bound to a signed customer session scoped to restaurant, table and session ID.
- Customer realtime tokens are scoped to one order and refresh before expiry.
- Reservation table replacement/reschedule locks the reservation, verifies tenant/branch/table state and updates the time window atomically.
- Reservation retries recover the deterministic access token and repair missing deposit/status/occupancy/reminder side effects.

Evidence:

- Focused reservation/QR/customer-session suites pass.
- Phase 3 migrations and the isolated PostGIS reservation rehearsal passed availability, overlap, deposit, QR, branch and tenant-isolation assertions.

Residual work:

- Repeat the reservation database rehearsal after the final migration chain is reconstructed.
- Test QR rotation, disabled-table access and realtime reconnect using actual role accounts in an isolated preview.

## Phase 4 - Staff, Attendance And Payroll

Implemented locally:

- Staff profile resolution is bound to auth user ID and no longer falls back by email.
- Force logout closes the staff auth epoch for linked ADMIN/STAFF profiles; a refresh token cannot bypass `auth_revoked_at`.
- PIN/password counters are atomic; PIN pepper and staff session signing use dedicated secret domains.
- Password reset rejects inactive staff and revokes existing sessions before credential replacement.
- Payroll regeneration is atomic, includes active salaried staff, approved overtime and paid/unpaid leave, avoids overtime double counting and prorates insurance correctly.

Database evidence:

- Phase 4 migrations `1900/1910/1920/1930` applied in a disposable PostgreSQL environment with their historical prerequisites.
- Concurrent auth counter, revoke/reactivate, tenant/RLS, direct-mutation denial and atomic payroll replacement tests passed.

Residual work:

- Run the full owner/manager/cashier/waiter/kitchen/employee matrix with actual preview accounts.
- Rehearse offline attendance replay, duplicate clock events, branch reassignment and payroll close/reopen policy with production-like data.

## Phase 5 - Release And Operations

Implemented locally:

- Domain workers no longer acknowledge fake success; unconfigured business adapters fail closed.
- Worker timeouts abort cooperative downstream IO.
- Poison SQS messages are retained for AWS redrive or copied to a configured DLQ before source deletion.
- Backup restore verification is strict by default, verifies downloaded SHA-256, and cannot report list-only/skipped restore as success.
- Cloudflare R2 gateway restricts all object operations to the configured backup prefix.
- Dashboard/customer realtime clients refresh expiring tokens and reconnect with new claims.
- Vercel preflight requires explicit project linking and release policy blocks known high-severity dependency findings.

Residual release blockers:

- Order/payment/inventory/reservation/staff workers still need real durable domain adapters and end-to-end queue replay evidence.
- Backup R2 authorization still uses a shared bearer credential inside the allowed prefix; method-scoped credentials, write-once retention and durable access audit remain required.
- No verified production database backup/PITR, isolated restore, immutable preview deployment or rollback rehearsal exists.
- The npm 10-compatible lockfile audit reports 0 high/critical, 3 moderate and 5 low advisories. Remaining moderate findings affect CopilotKit/MCP transitive paths and remain a security-hardening follow-up.
- Monitoring/alerting sign-off, production Staff HR secrets and authenticated QA sign-off are missing.

## Repository Reconciliation

- `origin/main` and `origin/codex/p0-production-clean` are ancestors of the current candidate.
- The two remote-only commits are older branch tips for daily Telegram backup reports and REST-based storage export. Their functional changes are present in the current tree under later commits and further hardening.
- `git fsck --no-reflogs --unreachable` found no unreachable commits. It reported only unreachable trees/blobs, which is not evidence of a lost committed handoff.
- The main local worktree and this isolated candidate overlap on 61 changed non-directory paths; 51 are byte-identical and 10 currently diverge. They must be reconciled by reviewed commits/merges, never by copying the candidate over the main worktree.
- The current worktree has 193 changed/untracked paths; 178 are staged in the reviewed Phase 1-5 scope after protected/unrelated exclusions. The unrelated Morning Brief route/test pair remains unstaged with the separate task.

## Final Verification

- Focused Phase 1-5 suite from the exact staged candidate: 149 tests; 148 passed, 0 failed and 1 database rehearsal was skipped without a configured URL.
- Full suite from the exact staged candidate: 906 tests; 905 passed, 0 failed and 1 database rehearsal was skipped without a configured URL.
- The migration inventory contract was decoupled from the protected migration snapshot and now enforces tracked, append-only migration history in the actual candidate worktree/CI checkout.
- The skipped test requires a configured database URL; equivalent isolated database rehearsals were run separately for Phases 1-4 as noted above.
- TypeScript: pass.
- ESLint: pass with 4 existing warnings and no errors.
- Production build: pass with `next build --webpack`; default Turbopack is blocked only by the worktree's external `node_modules` symlink.
- Cloudflare Worker dry-run and backup shell syntax: pass.
- `git diff --check`: pass.

## Upgrade Sequence

1. Preserve the candidate: review the 193-path status, exclude protected/unrelated files, stage the 178-path Phase 1-5 scope, then commit and push an immutable candidate SHA.
2. Reconstruct a disposable production-like database from the complete historical migration chain; do not use `schema.sql` as the sole bootstrap. Omitting historical promotion migration `20260519101000` leaves `orders.promotion_customer_key_hash` missing and blocks the Phase 1 create RPC.
3. Re-run Phase 1-4 SQL concurrency/RLS suites, including dine-in QR stock reservation and reservation reschedule races.
4. Implement real durable worker adapters, method-scoped immutable backup storage and monthly full restore verification.
5. Upgrade vulnerable dependencies with targeted versions, rebuild, and rerun the complete test/build/audit gate.
6. Create an isolated Vercel/Supabase preview, seed synthetic restaurants and run every role, branch and tenant-negative scenario with cleanup reconciliation.
7. Prove preview rollback, monitoring alerts, queue DLQ replay and backup restore before requesting production promotion.
