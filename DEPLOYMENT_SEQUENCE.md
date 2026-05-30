# Deployment Sequence - LogiVN Production

## 2026-05-30 Production Deploy Sequence

Current sequence for this release:

1. Freeze release scope and keep all current dashboard/staff/VPS/Telegram changes in one commit.
2. Apply Supabase migration before code deploy.
3. Verify schema through REST checks for staff code, employee identity/password columns, and `staff_incident_reports`.
4. Verify migration history contains `20260530103818_staff_identity_password_login`.
5. Run local release gates: whitespace, infra contract, TypeScript, VPS typecheck, tests, lint and Vercel production build.
6. Commit and push `codex/p0-production-clean`.
7. Deploy the prebuilt Vercel production artifact with `vercel deploy --prebuilt --prod`.
8. Run production smoke and first-hour watch.

Abort conditions for this release:

| Condition | Action |
| --- | --- |
| Any P0 validation fails | Do not deploy; fix forward and rerun full gate. |
| Supabase schema check fails | Do not deploy code that depends on staff identity/password columns. |
| Vercel build fails | Do not deploy; preserve previous production. |
| Staff/order/payment smoke fails after deploy | Roll back Vercel code first and leave additive DB schema in place. |

VPS cache sequencing: deploy VPS gateway cache endpoints before enabling `LOGIVN_VPS_DASHBOARD_CACHE_ENABLED=1` in production.

## 2026-05-29 Gate Update

Before any production promotion, run:

```bash
npm run release:blockers:strict
```

Current status is NO-GO because backup/PITR proof, authenticated QA and monitoring/alerting sign-off remain incomplete. `supabase db push --dry-run --linked --yes` now reports `Remote database is up to date`; do not follow the old 16-file pending migration apply sequence unless a future dry-run shows pending migrations again.

Date: 2026-05-20
Current instruction: production deployment is conditionally allowed only after external go-live blockers are closed.

## Abort Conditions

Abort immediately if any of these are true:

| Condition | Current Status |
| --- | --- |
| `npm run infra:check` fails | False in latest local gate |
| Branch is behind upstream | False |
| Worktree has unrelated staged/unstaged/untracked changes | False |
| Migration files are untracked or remote/local history is inconsistent | False for local tracking; remote pending batch still needs staging proof |
| Duplicate migration version exists | False in latest local scan |
| Billing v2 parity is warning/failing | False in latest local gate |
| Backup/PITR state is not captured before migration | True; abort production migration until captured |
| Vercel production preflight fails | False in latest local preflight |
| Supabase migration dry-run fails | False in latest local dry-run |

## Phase 0 - Release Freeze

1. Announce merge freeze.
2. Allow only P0 remediation commits.
3. Choose the release source of truth:
   - either current local branch after reconciliation,
   - or `origin/codex/p0-production-clean`,
   - or a new `release/yyyy-mm-dd` branch.
4. Resolve the branch behind state.
5. Clear or intentionally commit every staged, unstaged and untracked file.
6. Refresh `HANDOFF.md`, `ACTIVE_BRANCHES.md`, `WORKTREE_MAP.md`, `MIGRATION_LOG.md`, `MASTER_RELEASE_STATUS.md` and `FINAL_GO_NO_GO.md`.

## Phase 1 - Preflight Checks

Run from the clean release artifact:

```bash
git status --short --branch
git diff --check
git diff --cached --check
npm run infra:check
npm run lint
npx tsc --noEmit --pretty false --incremental false
npm test
NEXT_PRIVATE_BUILD_WORKER=0 npm run build
npm audit --audit-level=high
npm run billing:verify
npm run seo:week5
npm run seo:agentic
```

Required result:

- all commands pass,
- `npm run billing:verify` has no subscription/payment warning unless a release commander waiver is documented,
- no generated reports or artifacts are unintentionally included.

## Phase 2 - Supabase Migration Reconciliation

1. Run:

```bash
supabase migration list --linked
supabase db push --dry-run --linked --yes
git ls-files --others --exclude-standard supabase/migrations supabase/schema.sql types/supabase.ts
```

2. Confirm every intended migration is tracked in Git.
3. Confirm remote history matches all migrations up to `20260518190204`.
4. Confirm whether every pending `20260519*.sql` migration is intended for this release.
5. Verify migration versions remain unique.
6. Verify `20260519120000_billing_webhook_idempotency.sql` on staging; it now uses a regular unique partial index and should not depend on concurrent-index runner behavior.
7. If intended, rehearse the full pending batch on staging first.
8. Record staging output and verification SQL in `MIGRATION_LOG.md`.
9. Capture Supabase backup/PITR timestamp before production apply.

Current known ordering:

| Order | Migration | Status |
| --- | --- | --- |
| 1 | Through `20260518190204_staff_attendance_qr_device_trust.sql` | Applied remotely according to `supabase migration list --linked`. |
| 2 | `20260519090000_reservation_realtime_publication.sql` through `20260519201100_users_lower_email_lookup_idx.sql` | Local only; pending remotely. |

Production apply rule:

- Do not reorder timestamped migrations.
- Do not squash this release after remote has applied history.
- Do not deploy code that depends on a pending migration before the migration is applied and verified.

## Phase 3 - Vercel Preflight

Preferred path:

1. Run the manual `.github/workflows/vercel-preflight.yml` workflow, or run the equivalent locally with Vercel CLI `54.2.0`.
2. Pull production env:

```bash
vercel pull --yes --environment=production
```

3. Build with production env:

```bash
vercel build --prod
```

4. Keep the prebuilt artifact for verification.

If using CI, pin the Vercel CLI version and require:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Phase 4 - Production Deployment

Only after Phases 0-3 pass:

1. Confirm current production deployment ID and rollback target.
2. Apply Supabase migration if required.
3. Verify migration with SQL/readiness checks.
4. Deploy or promote the validated Vercel artifact:

```bash
vercel deploy --prebuilt --prod
```

or promote an already validated preview deployment:

```bash
vercel promote <deployment-url-or-id>
```

5. Record production URL, deployment ID, commit SHA and migration versions.

## Phase 5 - Post-Deploy Smoke

Run immediately:

```bash
npm run smoke:production
```

Then manually verify:

| Flow | Required Result |
| --- | --- |
| `/api/health` | `ok=true`, Supabase connected. |
| Owner login | Successful login and redirect to dashboard. |
| Billing settings | Entitlement and payment state render correctly. |
| QR dine-in order | Create order, payment state, merchant confirmation. |
| Remote order | Pickup and delivery quote flows work. |
| Reservation | Deposit/cancel/closure logic works. |
| Admin RBAC | Scoped platform role cannot exceed permissions. |
| Staff QR/device trust | Attendance flow works for trusted and untrusted devices. |
| Cron | Secret-protected manual trigger works in staging before production use. |

## Phase 6 - Monitoring Window

Keep active monitoring open for:

| Window | Action |
| --- | --- |
| First 5 minutes | Watch Vercel errors, Supabase health, auth failures, cron failures and payment/billing logs. |
| 15 minutes | Confirm no increase in 5xx, auth callback errors, checkout errors or subscription entitlement mismatches. |
| 1 hour | Confirm cron schedule registration, traffic health and support inbox. |
| Next business day | Review billing parity, analytics events, cron run logs and customer/order anomalies. |

## Vercel Cron Inventory

Current `vercel.json`:

| Path | Schedule UTC |
| --- | --- |
| `/api/cron/reports` | `0 1 * * *` |
| `/api/cron/ai-ops` | `30 1 * * *` |
| `/api/cron/reservations/expire` | `45 1 * * *` |
| `/api/cron/subscriptions` | `15 2 * * *` |

Static cron documentation now matches `vercel.json`; runtime cron trigger proof is still required before GO.
