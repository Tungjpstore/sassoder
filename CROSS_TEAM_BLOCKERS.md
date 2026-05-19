# Cross-Team Blockers - LogiVN Release

Date: 2026-05-20
Final release stance: NO-GO until P0 blockers are closed.

## P0 Blockers

| ID | Blocker | Owner | Evidence | Required Exit Criteria |
| --- | --- | --- | --- | --- |
| P0-01 | Release artifact is not stable | Release / Repo Owner | Branch `codex/p0-production-clean` is behind upstream by 4 commits. Worktree currently has 429 staged files, 208 unstaged modified files and 229 untracked files. `HANDOFF.md`, `WORKTREE_MAP.md` and `ACTIVE_BRANCHES.md` still describe an older clean/ahead state. | Decide the intended release commit, reconcile with upstream, clear or intentionally commit/stage all release files, refresh handoff docs, and rerun full release gate from a clean artifact. |
| P0-04 | Supabase migration tracking is not release-safe | Database / Release | `supabase migration list --linked` previously showed remote applied through `20260518190204`; local has pending migrations from `20260519090000` through `20260519201100`, with 98 local SQL migration files and only 69 currently tracked by Git. | Commit or remove every intended migration file, confirm remote/local history, rehearse pending migrations on staging using `MIGRATION_RELEASE_REHEARSAL.md`, update `MIGRATION_LOG.md`, and add rollback/fix-forward notes. |
| P0-05 | Database rollback is not ready | Database / Release | Current runbook states Supabase migrations are forward-first and should not be assumed reversible. Current migration set includes RLS rewrites, trigger/function changes, realtime publication changes and generated column/index changes. | Capture backup proof, write per-risk migration rollback/fix-forward notes, define data validation SQL, and assign the DB rollback commander before production migration. |

## Closed P0 Items

| ID | Blocker | Owner | Closure Evidence | Residual Note |
| --- | --- | --- | --- | --- |
| P0-02 | Service-role boundary guardrail was failing | Backend / Security | `npm run infra:check` now passes with 0 direct app service-role violations. | Keep `infra:check` mandatory in CI/manual release gate. |
| P0-03 | Billing v2 subscription parity was incomplete | Billing | `npm run billing:verify` now passes: subscription backfill `16/16`, payment backfill `6/6`, pending mirror `0/0`. | Document billing source-of-truth/cutover policy before GO. |
| P0-06 | Duplicate Supabase migration version | Database / Release | Duplicate `20260519103000` was resolved locally; current files are `20260519103000_staff_operations_security_hardening.sql` and `20260519103500_promotion_free_item_rewards.sql`. | Keep migration versions unique and verify expected order in staging. |

## P1 Blockers Before Conditional Go

| ID | Risk | Owner | Evidence | Required Action |
| --- | --- | --- | --- | --- |
| P1-01 | CI gate still needs production-only coverage | DevOps | `.github/workflows/seo-ci.yml` now runs infra, lint, typecheck, tests, audit, SEO and build. Manual workflow runs fail if billing secrets are missing, but production smoke and authenticated QA are still outside CI. | Confirm required GitHub secrets, run workflow on release branch, and record manual production smoke/authenticated QA evidence. |
| P1-04 | Secret rotation status is unknown | Security / Ops | Security audit notes real `.env.local` secrets existed locally and should be rotated if shared. Rotation proof was not captured. | Confirm production secret owners, rotation dates and no accidental exposure. |
| P1-05 | Alerting/log drain readiness is not proven | Ops | Cron logs and health endpoint exist, but no proof of Vercel Log Drains, alert routing, paging threshold or dashboard ownership was captured. | Confirm runtime logs, cron failure alerts, billing/payment alerts and owner notification paths. |
| P1-06 | Backup evidence is missing | Database / Ops | No current Supabase backup snapshot or PITR restore proof was captured during this review. | Capture backup state before migrations and document restore/fix-forward process. |
| P1-07 | Actual Vercel env parity was not fully verified | DevOps | `.env.example` is broad, but actual production env values and feature gates were not fetched or diffed. | Run Vercel env preflight or equivalent controlled review for required runtime vars. |
| P1-08 | Full authenticated E2E is missing | QA | Existing tests are strong for units and pure flows; architecture audit still names missing E2E for auth, subscription gate, checkout, payment and reservation deposit. | Add E2E or perform signed manual QA for critical production flows. |
| P1-09 | Billing webhook idempotency migration needs runner proof | Database / Billing | `20260519120000_billing_webhook_idempotency.sql` uses `create unique index concurrently`. | Verify the Supabase migration runner can apply it outside a transaction, or replace with a safe production indexing procedure before staging/prod apply. |

## Closed P1 Items

| ID | Risk | Owner | Closure Evidence | Residual Note |
| --- | --- | --- | --- | --- |
| P1-02 | Vercel preflight workflow was missing | DevOps | `.github/workflows/vercel-preflight.yml` now exists, pins Vercel CLI `54.2.0`, validates required secrets and runs manual Vercel env pull + build for preview/production. | Requires an actual successful production run before GO. |
| P1-03 | Vercel cron schedule docs mismatched config | DevOps | `docs/infrastructure-runbook.md` now matches `vercel.json` for `/api/cron/reservations/expire` at `45 1 * * *`. | Runtime cron trigger still needs staging/manual proof. |

## Non-Blocking Warnings

| ID | Warning | Current Signal |
| --- | --- | --- |
| W-01 | `npm audit --audit-level=high` passes but 2 moderate advisories remain | `brace-expansion`, `ws`; no high/critical. |
| W-02 | Production smoke passed but is unauthenticated/validation-focused | 14/14 passed against `https://logivn.com`. It does not replace authenticated owner/customer payment testing. |
| W-03 | Supabase CLI is behind latest | Installed `2.98.2`, available `2.100.0`. Not a blocker, but note for future tooling changes. |

## Blocker Closure Protocol

For every P0:

1. Assign a single owner.
2. Record the exact remediation commit or SQL evidence.
3. Rerun the relevant gate.
4. Update `MASTER_RELEASE_STATUS.md`.
5. Re-run final go/no-go only after all P0s are closed.
