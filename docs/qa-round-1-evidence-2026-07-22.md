# QA Round 1 Evidence - Owner, Staff Creation And Hydration

Date: 2026-07-22

Status: **IN PROGRESS / NO-GO**

Scope excludes `logimail/`. Account identifiers, credentials, tokens, tenant UUIDs and personal data are intentionally redacted.

## Candidate

- Environment under live audit: current production at the tenant dashboard.
- Local candidate: dirty worktree outside `logimail/`; no commit, push or deployment was requested or performed.
- Database migrations: owner and financial hardening remain local and unrehearsed on PostgreSQL.

## Evidence 1 - Canonical Owner Profile

- Persona: canonical owner.
- Action: open settings profile, submit unchanged data, add a unique QA marker to the description, save, reload, restore the exact previous value and reload again.
- Expected: owner can update ordinary tenant profile data; marker persists once and cleanup removes it.
- Observed UI: pass.
- Observed persistence: pass.
- Cleanup: pass; marker is absent after restore.
- Result: **PASS on current production**.

## Evidence 2 - Staff Creation Failure

- Persona: canonical owner.
- Action: submit the real staff invitation flow three times using marked QA names, once with explicit login fields and twice with generated credentials.
- Expected: one QA staff account is created and temporary credentials are returned.
- Observed UI: modal remained open and no QA staff appeared after reload.
- Observed operation ledger: `staff.create` failed with `invalid input syntax for type date: ""`.
- Observed database state: no QA staff row remained; temporary Auth creation was rolled back.
- Cleanup: no staff cleanup required because no staff account persisted.
- Result: **FAIL on current production**.

## Root Cause And Local Fix

- Blank optional `<input type="date">` submitted `dateOfBirth=""`.
- Validation accepted the empty string and the create action forwarded it to a PostgreSQL `date` parameter.
- Local fix normalizes blank optional staff birth dates to `undefined` and applies a second action-boundary guard.
- Regression coverage proves blank dates normalize before database writes while valid dates remain accepted.

## Evidence 3 - Production Hydration Error

- Persona: canonical owner.
- Surfaces: staff and settings.
- Observed console: React production error `#418`, a hydration text mismatch.
- Reproduction: a full production load of the kitchen screen with one active order emitted a new `#418` event while the visible second-level elapsed timer was rendered.
- Confirmed source risks: browser storage/network state during first render, `Date.now()` timers rendered on server and browser, locale date output without a fixed timezone, and kitchen cache substitution during initial hydration.
- Local containment covers staff/settings, staff mobile, kitchen, overview, orders, online ordering and reservations.
- Result: **FAIL on current production; local fix not yet live-tested**.

## Local Verification

- `npm test`: 753 discovered, 752 passed, 0 failed, 1 PostgreSQL rehearsal skipped.
- Targeted HR/hydration tests: pass.
- `npx tsc --noEmit`: pass.
- Targeted ESLint for all changed Round 1 files: pass.
- Production build: pass, 160 routes/pages generated.
- `git diff --check` on the changed Round 1 files: pass.

## Missing Real-Account Proof

Round 1 remains open until a deployed candidate is available and the following real actions pass:

1. Owner creates a marked QA manager with blank optional date fields.
2. Manager can access allowed ordinary settings but cannot access billing, receiving-bank or owner mutations.
3. Cashier completes an allowed QA payment transition.
4. Kitchen and delivery personas can perform only their assigned operational actions.
5. Staff mobile reloads with an offline queue and across account switches without hydration errors, data leakage or queue replay under another identity.
6. Kitchen, overview, orders, online and reservations reload with active QA records and no React `#418` console event.
7. Owner deletes or archives every QA account and reconciles all QA orders, bills, attendance rows and audit records by exact ID.

No production deployment or VPS action is justified until a backup/restore path and a candidate-specific rollback path are documented.
