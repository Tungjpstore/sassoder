# Cross-Team Blockers - LogiVN Release

Date: 2026-05-20
Final release stance: CONDITIONAL GO for local artifact; production GO requires external release evidence.

## External Go-Live Blockers

| ID | Blocker | Owner | Evidence | Required Exit Criteria |
| --- | --- | --- | --- | --- |
| EXT-01 | Supabase staging rehearsal not captured | Database / Release | `supabase db push --dry-run --linked --yes` passed and would apply 16 migrations from `20260519090000` through `20260519201100`. `supabase branches create release-20260520` failed because Branching requires Supabase Pro or above. | Provide a staging DB URL/project, upgrade/enable Supabase branching, or approve another isolated rehearsal environment before production migration. |
| EXT-02 | Production backup/PITR proof missing | Database / Ops | `supabase backups list --project-ref tfhqatvevbrbzaaqjhfa` exits 0 and reports `WALG=true`, `PITR=false`, earliest/latest timestamp `0`. CLI schema dump was blocked because Docker daemon is not running. | Enable/confirm backup/PITR or provide a valid pre-release backup artifact before production migration. |
| EXT-04 | Authenticated production/staging QA missing | QA / Release | Unit/build/smoke pass, but signed owner/customer/staff/admin flows are not proven on final artifact. | Complete manual/E2E checklist in `RELEASE_CHECKLIST.md`. |
| EXT-05 | Alerting/log drain sign-off missing | Ops | Health and cron contracts exist; alert destination, log drain and first-hour watch owner are not proven. | Record alert routes, owners and monitoring window. |

## Closed P0 Items

| ID | Blocker | Owner | Closure Evidence | Residual Note |
| --- | --- | --- | --- | --- |
| P0-02 | Service-role boundary guardrail was failing | Backend / Security | `npm run infra:check` now passes with 0 direct app service-role violations. | Keep `infra:check` mandatory in CI/manual release gate. |
| P0-03 | Billing v2 subscription parity was incomplete | Billing | `npm run billing:verify` now passes: subscription backfill `16/16`, payment backfill `6/6`, pending mirror `0/0`. | Document billing source-of-truth/cutover policy before GO. |
| P0-06 | Duplicate Supabase migration version | Database / Release | Duplicate `20260519103000` was resolved locally; current files are `20260519103000_staff_operations_security_hardening.sql` and `20260519103500_promotion_free_item_rewards.sql`. | Keep migration versions unique and verify expected order in staging. |
| P0-01 | Release artifact was not stable | Release / Repo Owner | Clean release artifact exists at `879cfbf`; worktree has no unstaged or untracked files and branch is ahead of upstream by 2 commits, behind by 0. | Push branch and keep freeze. |
| P0-04 | Supabase migration tracking was not release-safe | Database / Release | All 98 local SQL migration files are now tracked by Git. | Staging rehearsal remains an external go-live blocker. |
| P0-05 | Database rollback notes were incomplete | Database / Release | `ROLLBACK_PLAN.md` now includes pending-batch fix-forward notes. | Backup/PITR proof remains an external go-live blocker. |
| P0-07 | Pending migration list was not dry-run verified | Database / Release | `supabase db push --dry-run --linked --yes` exits 0 and lists the expected 16 pending migrations. | Keep dry-run output with the release evidence. |
| P1-02 | Vercel preflight workflow was missing | DevOps | `.github/workflows/vercel-preflight.yml` exists, pins Vercel CLI `54.2.0`, validates required secrets, and local `vercel pull --environment=production && vercel build --prod` passed. | Re-run in GitHub Actions after pushing if required by release policy. |

## P1 Blockers Before Conditional Go

| ID | Risk | Owner | Evidence | Required Action |
| --- | --- | --- | --- | --- |
| P1-01 | CI gate still needs production-only coverage | DevOps | `.github/workflows/seo-ci.yml` now runs infra, lint, typecheck, tests, audit, SEO and build. Manual workflow runs fail if billing secrets are missing, but production smoke and authenticated QA are still outside CI. | Confirm required GitHub secrets, run workflow on release branch, and record manual production smoke/authenticated QA evidence. |
| P1-04 | Secret rotation status is unknown | Security / Ops | Security audit notes real `.env.local` secrets existed locally and should be rotated if shared. Rotation proof was not captured. | Confirm production secret owners, rotation dates and no accidental exposure. |
| P1-05 | Alerting/log drain readiness is not proven | Ops | Cron logs and health endpoint exist, but no proof of Vercel Log Drains, alert routing, paging threshold or dashboard ownership was captured. | Confirm runtime logs, cron failure alerts, billing/payment alerts and owner notification paths. |
| P1-06 | Backup evidence is missing | Database / Ops | No current Supabase backup snapshot or PITR restore proof was captured during this review. | Capture backup state before migrations and document restore/fix-forward process. |
| P1-07 | Actual Vercel env parity was not fully verified | DevOps | `.env.example` is broad, but actual production env values and feature gates were not fetched or diffed. | Run Vercel env preflight or equivalent controlled review for required runtime vars. |
| P1-08 | Full authenticated E2E is missing | QA | Existing tests are strong for units and pure flows; architecture audit still names missing E2E for auth, subscription gate, checkout, payment and reservation deposit. | Add E2E or perform signed manual QA for critical production flows. |

## Closed P1 Items

| ID | Risk | Owner | Closure Evidence | Residual Note |
| --- | --- | --- | --- | --- |
| P1-03 | Vercel cron schedule docs mismatched config | DevOps | `docs/infrastructure-runbook.md` now matches `vercel.json` for `/api/cron/reservations/expire` at `45 1 * * *`. | Runtime cron trigger still needs staging/manual proof. |
| P1-09 | Billing webhook idempotency migration runner risk | Database / Billing | `20260519120000_billing_webhook_idempotency.sql` now uses regular `create unique index if not exists`; `billing_payment_logs` currently has 10 rows in billing verification evidence. | Keep staging rehearsal as final proof. |

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
