# Release Checklist - LogiVN Production

## 2026-05-29 Current Gate

Result: NO-GO for production promotion.

Use `npm run release:blockers` for current external evidence. The current Supabase dry-run reports `Remote database is up to date`, so the old 16-file pending migration apply list is stale. The live blockers are now backup/PITR proof, authenticated QA sign-off and monitoring/alerting sign-off.

Required before GO:

1. Enable PITR or capture a usable full data backup and restore note. A schema-only dump exists at `reports/release/pre-release-schema-20260529T105852Z.sql`, but it is not sufficient for data rollback.
2. Complete `RELEASE_QA_SIGNOFF.md` with real tester evidence.
3. Complete `MONITORING_ALERTING_RUNBOOK.md` and set the `MONITORING_*` release env values.
4. Rerun `npm run release:blockers:strict` and confirm it exits 0.

Date: 2026-05-20
Current result: CONDITIONAL GO for local artifact

## 1. Merge Freeze And Source Control

| Item | Status | Evidence / Required Action |
| --- | --- | --- |
| Confirm release branch and commit | Pass locally | Current local branch is `codex/p0-production-clean` at `879cfbf`, ahead of upstream `57d9784` by 2 commits and behind by 0. |
| Clean worktree before release | Pass | No staged, unstaged or untracked files after release artifact commit. |
| Freeze non-blocker work | Required now | Only blocker remediation should land until next release review. |
| Refresh handoff/release docs | Blocked | Existing branch/worktree/migration docs are stale relative to today. |
| Ensure no hidden worktrees | Pass | Prunable stale worktree metadata was removed; `git worktree list` now shows only the current worktree. |

## 2. Local Verification Gate

| Command | Status |
| --- | --- |
| `git diff --check` | Pass |
| `git diff --cached --check` | Pass |
| `npm run infra:check` | Pass |
| `npm run lint` | Pass |
| `npx tsc --noEmit --pretty false --incremental false` | Pass |
| `npm test` | Pass, 259 tests |
| `NEXT_PRIVATE_BUILD_WORKER=0 npm run build` | Pass, exit 0 |
| `npm audit --audit-level=high` | Pass threshold, 2 moderate advisories |
| `npm run seo:week5` | Pass, 100/100 |
| `npm run seo:agentic` | Pass, 100/100 |
| `npm run billing:verify` | Pass |
| `npm run smoke:production` | Pass, 14/14 |

## 3. CI/CD Gate

| Item | Status | Required Action |
| --- | --- | --- |
| GitHub Actions green for release branch | Not enough evidence | Release CI exists, but it has not been run/verified for the final release artifact. Manual runs now require billing secrets instead of silently skipping billing verification. |
| CI runs infra contract | Present | `.github/workflows/seo-ci.yml` now runs `npm run infra:check`. |
| CI runs unit tests | Present | `.github/workflows/seo-ci.yml` now runs `npm test`. |
| CI runs build | Present | `.github/workflows/seo-ci.yml` runs `npm run build`. |
| Vercel production preflight | Pass locally | `vercel pull --yes --environment=production` and `vercel build --prod` passed with Vercel CLI `54.2.0`. |
| Vercel rollback target identified | Pending | Capture current production deployment ID/URL before promotion. |

## 4. Supabase And Migration Gate

| Item | Status | Required Action |
| --- | --- | --- |
| Local migration files all tracked | Pass | 98 local SQL migrations exist and all 98 are tracked by Git. |
| Remote migration history reconciled | Blocked | Remote is applied through `20260518190204`; local pending migrations run from `20260519090000` through `20260519201100`. |
| Migration versions are unique | Pass locally | Duplicate `20260519103000` was resolved as `20260519103500_promotion_free_item_rewards.sql`; keep this verified before staging/prod. |
| Migration dry-run | Pass | `supabase db push --dry-run --linked --yes` exits 0 and lists 16 pending migrations in timestamp order. |
| Migration order locked | Conditional | Timestamp order is clear, tracked and dry-run verified; staging apply proof is still required. |
| Staging migration rehearsal complete | Blocked externally | Supabase Branching is unavailable on the current org plan; provide staging DB URL/project or enable branching. |
| Schema/types aligned with migrations | Blocked | `supabase/schema.sql` and `types/supabase.ts` have staged/modified drift. |
| RLS guardrails pass | Pass for app boundary | `infra:check` now reports 0 direct app service-role violations; pending RLS/security migrations still need staging verification. |
| Backup/PITR confirmed | Blocked externally | Supabase backup list reports `PITR=false`; CLI dump is blocked because Docker daemon is not running. |
| Rollback/fix-forward SQL notes ready | Missing | Required for realtime publication, RLS rewrites, trigger/function changes and generated/index changes. |
| Concurrent index migration verified | Pass locally | `20260519120000_billing_webhook_idempotency.sql` no longer uses `concurrently`; staging rehearsal remains final proof. |

## 5. Vercel And Runtime Config Gate

| Item | Status | Evidence / Required Action |
| --- | --- | --- |
| `vercel.json` valid | Conditional | 4 crons and `sin1` region are present. |
| Cron route files exist and enforce secret | Pass for static contract | `infra:check` validates cron wiring. Cron runtime behavior still needs staging/manual trigger proof. |
| Cron schedules match docs | Pass for static docs | `docs/infrastructure-runbook.md` and `vercel.json` both list reservations expiry at `45 1 * * *`. |
| Production env parity verified | Pass for build preflight | Vercel production env pull succeeded and production build passed. Secret value review/rotation still belongs to Ops. |
| Production URLs smoke-tested | Pass | `https://logivn.com` smoke passed. |
| Wildcard tenant domain tested | Missing | No fresh wildcard subdomain smoke captured. |
| DNS/domain readiness confirmed | Conditional | Root domain passed; wildcard/DNS provider status not rechecked today. |

## 6. Billing, Payments And Entitlements

| Item | Status | Evidence / Required Action |
| --- | --- | --- |
| Payment mirror parity | Pass | `6/6` payments mirrored in `npm run billing:verify`. |
| Pending payment mirror | Pass | `0/0`. |
| Subscription v2 parity | Pass | `16/16`; 0 restaurants missing in v2. |
| Entitlement source of truth declared | Pending | Bridge mode remains; release must declare whether v2 is authoritative. |
| Billing rollback path | Missing | Need plan for entitlement drift if code is rolled back but v2 writes remain. |

## 7. Operational Safety

| Item | Status | Required Action |
| --- | --- | --- |
| Health endpoint | Pass | Production smoke confirmed Supabase connected. |
| Monitoring dashboard | Conditional | `admin.logivn.com/ops` and cron logs exist, but dashboard ownership not verified. |
| Alerting | Missing | No proof of alert destinations or thresholds. |
| Logging coverage | Conditional | Cron and audit logs exist; log drain/export not proven. |
| Analytics integrity | Conditional | SEO audits pass; billing/AI analytics depend on parity fix. |
| Rate limiting | Conditional | Code-level rate limits exist; production distributed limiter env not verified. |
| Secrets rotation | Missing | Need confirmation for Supabase service role, Mapbox/Goong/Vietmap, AI providers, Resend, admin and cron secrets. |

## 8. Manual Smoke Required Before Any Conditional Go

These are not optional for production:

| Flow | Status |
| --- | --- |
| Owner login via email OTP | Missing |
| Google OAuth login/callback | Smoke validates redirect contract only; full login missing |
| Subscription gate and billing renewal | Missing |
| QR dine-in order create/pay/confirm | Missing |
| Remote pickup order checkout | Missing |
| Remote delivery quote and checkout | Missing |
| Reservation with deposit and cancellation/refund behavior | Missing |
| Staff attendance QR/device trust flow | Missing |
| Admin platform RBAC login and scoped mutation | Missing |
| Cron manual trigger with `CRON_SECRET` in staging | Missing |

## Release Checklist Result

CONDITIONAL GO for the local release artifact. Production deployment still requires the external go-live blockers in `CROSS_TEAM_BLOCKERS.md` to be closed.
