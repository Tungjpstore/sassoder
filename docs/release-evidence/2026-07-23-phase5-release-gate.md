# Phase 5 Release Gate Evidence

Date: 2026-07-23 (Asia/Tokyo)

Candidate branch: `codex/phase1-5-20260722`

This record covers release readiness, dependency policy, preview/build plumbing, backup/restore evidence, rollback safety, worker/realtime operations and observability. No production deployment, migration apply, Cloudflare publish, VPS restart or browser-side configuration change was performed.

## Automated Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Dependency policy unit tests | Pass | `npx tsx --test lib/dependency-audit-policy.test.ts lib/release-readiness-policy.test.ts` (13/13) |
| Release contract tests | Pass | `npx tsx --test lib/phase5-release-contract.test.ts lib/dependency-audit-policy.test.ts lib/release-readiness-policy.test.ts` (16/16) |
| Release preflight report | NO-GO | `node scripts/infra/release-external-blockers.mjs --report-only` |
| Strict release exit | Pass as a guard | `node scripts/infra/release-external-blockers.mjs --strict` exits 1 with five blockers |
| npm dependency audit | Block | 0 critical, 5 high, 22 moderate, 6 low; the gate now parses and blocks high/critical findings |
| Migration inventory | Pass locally | 151 SQL files, unique timestamp versions; remote history was not authenticated from this worktree |
| Docker availability | Pass locally | Docker daemon responds; `pg_dump` binary is not installed outside Docker |
| Wrangler Worker dry-run | Pass locally | Worker bundle 5.34 KiB; `BACKUP_BUCKET` R2 binding detected; no publish performed |

## Release Blockers

1. **Dependency vulnerabilities (P1/P0 depending on exposure).** `npm audit --audit-level=high` reports 5 high findings, including `next`/`sharp`, `fast-uri`, `js-yaml` and `brace-expansion`. The new `dependency-audit-policy.mjs` blocks a release when critical/high counts are non-zero. Upgrade, verify application compatibility, then rerun the gate.
2. **Supabase release context is unavailable in the worktree.** `SUPABASE_PROJECT_REF` and local linked project metadata are absent, so migration dry-run, backup/PITR status and remote history cannot be treated as verified. Do not apply the new migration batch without an authenticated project check and isolated restore rehearsal.
3. **Authenticated QA sign-off is stale/waived.** The current sign-off does not match this branch/commit, is older than the 14-day policy window, lacks a structured migration count and contains a waiver. Real-account evidence for every role/tenant/branch plus cleanup, audit reconciliation and rollback is required.
4. **Monitoring values are not proven in the active release environment.** The runbook text exists, but the release gate cannot find the required `MONITORING_*` values in local/Vercel-readable sources. Record the actual owner, route, log drain, threshold and first-hour window, then rerun strict preflight.
5. **Staff HR secrets are not proven.** QR, attendance-session and PIN-pepper values are missing locally and Vercel project lookup is not linked in this CLI context. Staff role E2E must remain blocked until production/preview secret presence is verified without exposing values.
6. **No immutable preview candidate or rollback target has been validated.** The Vercel workflow now links the explicit team/project before pulling env and uploads `.vercel/output`, but no authenticated preview deployment ID, commit, smoke result or promotion/rollback rehearsal was captured.
7. **Database backup/restore is not independently proven.** Prior infrastructure inspection found no scheduled PITR on the current Supabase plan and no independently restorable VPS/Cloudflare artifact. A schema-only dump is not enough for data rollback; capture an encrypted logical/physical backup and restore critical tables in an isolated target.
8. **Cloudflare backup gateway lacks production release evidence.** The Worker now requires bearer auth and restricts list/get/put/head/delete to `BACKUP_R2_ALLOWED_PREFIX`. Production still needs method-scoped credentials, write-once retention, access audit and a canary upload/head/get/delete plus rollback deployment.
9. **Backup verification still lacks production proof.** Uploads now verify downloaded SHA-256 and restore/list-only/skipped paths cannot report success, but encrypted database/VPS backup and isolated restore evidence are still missing.
10. **Worker processing is not production-complete.** Order, payment, inventory, reservation and staff workers now fail closed instead of acknowledging fake success; their durable business adapters and end-to-end DB/outbox/notification/realtime rehearsals are still absent.
11. **Queue/retry production evidence is unproven.** Worker timeouts now abort cooperative downstream IO and SQS poison messages are retained or quarantined before deletion. Live replay, DLQ recovery and lease-guarded finalization still need proof.
12. **Realtime recovery is hardened locally but not live-verified.** Dashboard/customer clients refresh expiring tokens and reconnect with new claims. Forced-expiry, cross-tenant denial and post-reconnect reconciliation still require authenticated preview evidence.
13. **VPS deployment can report a skip as success.** The deployment workflow intentionally prints a skip when `VPS_HOST`/`VPS_SSH_KEY` are absent. A release commander must distinguish “not configured” from “deployed and validated”; the workflow must fail or explicitly mark the release as not deployable when a VPS rollout is required.

## Changes In This Pass

- Added pure npm audit evaluation policy and tests at `scripts/infra/dependency-audit-policy.mjs` and `lib/dependency-audit-policy.test.ts`.
- Wired the high/critical dependency gate into `scripts/infra/release-external-blockers.mjs`.
- Removed `.env.local` from release evidence sources so developer-only values cannot satisfy production monitoring/staff-secret gates.
- Added release contract tests at `lib/phase5-release-contract.test.ts`.
- Updated `.github/workflows/vercel-preflight.yml` to link the explicit Vercel team/project before environment pull/build.
- Updated `.github/workflows/vps-deploy.yml` to request strict restore verification for the deployment validation path.
- Changed unconfigured domain workers from fake success to fail-closed and added cooperative timeout cancellation.
- Added SQS poison-message retention/quarantine, strict backup checksum/restore status, R2 namespace scope and realtime token refresh/reconnect contracts.

## Decision

`NO-GO` for production promotion. The local contract additions pass, but dependency, authenticated QA, environment/secret, backup/restore, preview rollback, and worker/realtime evidence remain incomplete. No amount of unauthenticated smoke testing overrides these release gates.
