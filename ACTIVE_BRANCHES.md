# LogiVN Active Branches

Last updated: 2026-08-29

## Branch Status

| Branch | Upstream | Divergence | Status | Owner | Recommended Action |
| --- | --- | --- | --- | --- | --- |
| `ui-ux-rebuild/phase-0-tokens` | `origin/ui-ux-rebuild/phase-0-tokens` | synced (0/0) | active integration branch, working tree clean | Tung | Continue Phase 0/1 work here; promote to `main` after release gates. |
| `main` | `origin/main` | 5 commits behind integration | production baseline | team | Fast-forward after next GO decision. |
| `codex/phase1-5-20260722` | `origin/codex/phase1-5-20260722` | synced | stale worktree pruned 2026-08-29 | Codex | Review then merge or archive. |
| `codex/p0-production-clean` | `origin/codex/p0-production-clean` | ancestor of integration | merged | Codex | Keep for history. |

## Snapshot Notes (2026-08-29)

- Phase 0 hardening work (251 files: dashboard v2, staff owner boundary, financial DML migrations, logimail P0) was committed and pushed as `8641825`, `24fd187`, `46e6afa`, `2cca038`.
- Verification gates on 2026-08-29: `npm ci` pass, `tsc --noEmit` pass, `npm test` 753 tests -> 752 pass / 0 fail / 1 skipped (PostgreSQL rehearsal needs `RESERVATION_DB_URL`).
- Supabase CLI remains 403 on branches/backups/dry-run endpoints; PITR and backup proof are still open blockers.

## Merge Risk Notes

- `codex/p0-production-clean` is the current integration branch for the consolidated production release.
- `codex/ui-ux-responsive-deploy` has one UI polish commit and is now free of stale worktree locks.
- `codex/seo-agentic-runtime` and `codex/seo-agentic-foundation` are likely overlapping with production release work; review file-by-file instead of blind merge.
- `codex/seo-foundation` is reachable from the active branch and can be deleted with `git branch -d codex/seo-foundation` after the team confirms it is not needed as a label.

## Branch Naming

Use scoped branch names:

- `codex/feature-short-name`
- `codex/fix-short-name`
- `codex/experiment-short-name`
- `hotfix/production-issue`
- `release/yyyy-mm-dd`

Avoid random branch names, multi-feature branches, and long-lived AI scratch branches.

## Handoff Checklist

- Branch purpose is documented.
- Changed surfaces are listed.
- Migration impact is documented in `MIGRATION_LOG.md`.
- Validation commands are recorded.
- Release or rollback notes are added when production behavior changes.
