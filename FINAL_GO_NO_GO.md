# Final Go / No-Go - LogiVN Production Release

## 2026-05-30 Final Decision

Decision: GO for production deployment, with a required first-hour watch.

Why this is GO:

1. No unresolved P0 remains in the current release batch.
2. Staff identity/password Supabase migration is applied before code deploy and verified in production schema.
3. Service-role boundary is clean: `npm run infra:check` reports 0 direct app service-role violations.
4. Build/verification gates pass: whitespace, infra, TypeScript, VPS typecheck, targeted staff RLS tests, full `npm test`, lint and Vercel production build.
5. Vercel production env contains encrypted required runtime secrets.

Release confidence: High for code/build/schema; Medium for operations.

Rollback confidence: High for Vercel code; Medium-low for DB because PITR is disabled. The applied DB migration is additive and should remain in place during code rollback.

Unresolved risks accepted for this deploy:

| Risk | Severity | Action |
| --- | --- | --- |
| Supabase PITR disabled | P1 | No destructive migrations; fix-forward only. Enable PITR/full backup before future risky DB work. |
| Manual authenticated QA not fully signed | P1 | Execute post-deploy smoke for owner/staff/order/payment/reservation/RBAC. |
| Monitoring/log-drain sign-off incomplete | P1 | Watch first-hour Vercel/Supabase/Telegram/payment errors and dashboard latency. |
| VPS dashboard cache flag sequencing | P1 | Keep cache flag disabled until VPS gateway cache endpoints are deployed and healthy. |

Final conclusion: GO.

## 2026-05-29 Refresh

Decision: NO-GO for production promotion.

The 2026-05-20 migration blocker is stale for the current remote state: `supabase db push --dry-run --linked --yes` now reports `Remote database is up to date`, with 108 local SQL migration files and no duplicate versions. That means there is no current pending production migration batch to apply, but the missing pre-apply staging rehearsal remains a residual process risk for the migrations that were already applied.

Production remains blocked by three live external gates:

1. Backup/PITR proof: Supabase reports `pitr_enabled=false` and `backups=[]`. A schema-only dump now exists at `reports/release/pre-release-schema-20260529T105852Z.sql`, but it does not replace PITR or a full data backup for rollback.
2. Authenticated QA: `RELEASE_QA_SIGNOFF.md` exists but still requires real tester sign-off for owner, Google OAuth, VietQR/order, reservation, staff and admin RBAC flows.
3. Monitoring/alerting: `MONITORING_ALERTING_RUNBOOK.md` exists but still needs real alert routes, log drain destination, owner and first-hour watch values.

Run `npm run release:blockers` for evidence capture or `npm run release:blockers:strict` as the release-blocking gate.

Date: 2026-05-20
Decision authority: Release Commander + Principal Production Coordinator

## Decision

CONDITIONAL GO for release artifact.

The local release artifact is ready for final external deployment gates. Do not promote to production until the remaining external blockers are closed.

## Decision Summary

Build and smoke signals are healthy, and local release-governance blockers are closed:

1. Release artifact is clean at `879cfbf`.
2. Branch is ahead of upstream by 2 commits and behind by 0.
3. All 98 local Supabase migration files are tracked.
4. Local infra/lint/typecheck/test/build/billing gates pass.
5. Vercel production env pull and production build pass.
6. Supabase dry-run confirms the expected 16 pending migrations without applying them.

Production GO is still blocked by external operational proof:

1. Supabase staging migration rehearsal. Current attempt to create a Supabase preview branch failed because the org is not on Pro.
2. Production backup/PITR evidence. Current backup listing reports `PITR=false`; schema dump is blocked by Docker not running.
3. Authenticated owner/customer/staff/admin QA.
4. Monitoring/alerting sign-off.

## Blockers

| Severity | Blocker | Release Impact |
| --- | --- | --- |
| External | Supabase staging rehearsal missing | Cannot safely apply pending migrations to production yet; Supabase Branching is not available on the current plan. |
| External | Backup/PITR proof missing | Cannot safely recover from migration failure yet; current backup listing reports `PITR=false`. |

## Release Confidence

Medium for local artifact; conditional for production.

Reason:

- Local infra/lint/typecheck/test/build pass.
- Billing parity passes.
- Production smoke passes.
- Artifact control blockers are closed.
- Remaining blockers are external: migration rehearsal, backup/PITR, authenticated QA and alerting sign-off.

## Rollback Confidence

Medium-low.

Reason:

- Vercel code rollback is feasible.
- Supabase rollback is documented as fix-forward-first, but backup/PITR proof is not captured yet.
- Billing bridge rollback still needs source-of-truth/cutover notes even though v2 parity now passes.
- Current migration state lacks backup proof and per-migration recovery notes.

## Validation Evidence

| Command | Result |
| --- | --- |
| `npm run infra:check` | Pass |
| `npm run lint` | Pass |
| `npx tsc --noEmit --pretty false --incremental false` | Pass |
| `npm test` | Pass, 259 tests |
| `NEXT_PRIVATE_BUILD_WORKER=0 npm run build` | Pass |
| `npm audit --audit-level=high` | Pass threshold |
| `npm run billing:verify` | Pass |
| `supabase migration list --linked` | Warning |
| `npm run smoke:production` | Pass |
| `npm run seo:week5` | Pass |
| `npm run seo:agentic` | Pass |

## Readiness Improvements Completed In This Pass

| Area | Improvement |
| --- | --- |
| Release CI | Manual workflow now fails if billing verification secrets are absent. |
| Vercel preflight | Required Vercel secrets are validated before build, and Vercel CLI is pinned to `54.2.0`. |
| Migration governance | Added `MIGRATION_RELEASE_REHEARSAL.md` and refreshed `MIGRATION_LOG.md` with current clean artifact state and pending migration proof requirements. |
| Rollback readiness | Added fix-forward guidance for each pending `20260519*.sql` migration. |

## Requirements To Move To Conditional Go

All must be complete:

1. Keep `npm run infra:check` passing.
2. Keep `npm run billing:verify` passing and document billing source-of-truth/cutover policy.
3. Reconcile Supabase remote/local migration history.
4. Verify the billing webhook concurrent index migration procedure.
5. Run staging migration rehearsal for pending migrations.
6. Capture Supabase backup/PITR proof.
7. Confirm rollback deployment ID.

## Requirements To Move To GO

In addition to Conditional Go:

1. CI or a signed manual gate covers infra, lint, typecheck, test, build, billing verify, security audit threshold and smoke.
2. Authenticated manual QA or E2E passes for:
   - owner login,
   - Google OAuth,
   - subscription gate,
   - QR order,
   - remote checkout,
   - reservation deposit,
   - staff QR/device trust,
   - platform admin RBAC.
3. Monitoring owner, alert destination and first-hour watch plan are confirmed.
4. DNS/wildcard tenant routing is smoke-tested.
5. Secrets rotation or non-exposure evidence is recorded.

## Unresolved Risks

| Risk | Current Handling |
| --- | --- |
| Billing entitlement drift | Block release until parity is clean or waived. |
| Tenant leak via service-role path | Latest `infra:check` passes; keep blocked until tenant-scope QA and migration rehearsal are complete. |
| Migration failure | Block release until staging rehearsal and rollback notes exist. |
| CI blind spot | Require expanded CI or signed manual release gate. |
| Alerting gap | Require owner and route for production alerts before GO. |
| Authenticated checkout gap | Require manual/E2E proof before GO. |

## Final Commander Statement

CONDITIONAL GO. Freeze non-blocker work. The code artifact is deploy-ready locally, but production promotion must wait for staging migration rehearsal, backup/PITR proof, authenticated QA and monitoring sign-off.
