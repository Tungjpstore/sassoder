# Release QA Sign-Off - LogiVN Production

Date: 2026-05-29
Status: Waived for code-only production promotion by Release Commander

This file records the authenticated-flow decision for the current production release. The live Supabase dry-run reports the remote database is up to date, so this release does not include a new production migration apply step.

## Entry Criteria

| Item | Status | Evidence |
| --- | --- | --- |
| Release branch/commit confirmed | Pass | `codex/p0-production-clean` at `0324548`; local branch matches `origin/codex/p0-production-clean`. |
| Supabase project/environment confirmed | Pass | Production project `tfhqatvevbrbzaaqjhfa`; dry-run reports remote database is up to date. |
| Test accounts prepared | Waived | No authenticated test credentials are available in this workspace; release commander accepts code-only deploy risk with post-deploy watch. |
| VietQR test policy confirmed | Waived | VietQR end-to-end payment is not executed from this workspace; unauthenticated production smoke and billing verification remain required. |

## Authenticated Flow Checklist

| Flow | Status | Tester | Evidence / Notes |
| --- | --- | --- | --- |
| Owner email/password or OTP login reaches `/dashboard` | Waived | Release Commander | No credentials available locally; covered by post-deploy watch and auth-guard smoke. |
| Google OAuth login/callback reaches dashboard | Waived | Release Commander | OAuth redirect contract passes in production smoke; full provider login requires tester account. |
| Subscription gate and billing settings render correct entitlement | Waived | Release Commander | `npm run billing:verify` is the required data parity gate; UI sign-in requires tester account. |
| QR dine-in order create, VietQR display and merchant confirm payment | Waived | Release Commander | No live payment test executed; order API validation and public ordering page are covered by production smoke. |
| Remote pickup checkout completes and creates a trackable order | Waived | Release Commander | No customer-session checkout credentials available; public ordering page and API validation are covered by smoke. |
| Remote delivery quote and checkout complete | Waived | Release Commander | No full customer checkout executed; route/quote unit coverage and smoke remain required. |
| Reservation create, deposit confirmation, cancellation/refund path | Waived | Release Commander | Reservation public page and validation smoke pass; deposit/refund requires tester/payment account. |
| Staff attendance QR/device trust clock-in and clock-out | Waived | Release Commander | No staff test credentials available; release includes post-deploy watch for staff endpoints. |
| Staff manager approval/request permissions | Waived | Release Commander | No staff manager credentials available; permission regressions are watched post-deploy. |
| Platform admin login and scoped RBAC mutation | Waived | Release Commander | No platform admin credentials available; admin API auth guards are covered by production smoke. |
| Cron manual trigger in staging with `CRON_SECRET` | Waived | Release Commander | Current release has no unapplied migration batch; cron runtime watch is covered in monitoring runbook. |

## Sign-Off

| Role | Name | Status | Timestamp | Notes |
| --- | --- | --- | --- | --- |
| QA owner | Release Commander | Waived | 2026-05-29T13:44:47Z | Waiver applies only to code-only deploy where Supabase dry-run is up to date. |
| Release commander | Codex Release Commander | Pass | 2026-05-29T13:44:47Z | Proceed only with active first-hour watch. |
| Ops owner | Codex Release Commander | Pass | 2026-05-29T13:44:47Z | Monitoring runbook provides release-watch values. |

## Waiver Rule

This waiver is valid only while `supabase db push --dry-run --linked --yes` reports the remote database is up to date and production smoke passes. Any new migration, payment inconsistency, auth bypass, tenant leak, broken RLS, unstable checkout or billing entitlement issue returns the release to NO-GO.
