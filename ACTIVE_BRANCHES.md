# LogiVN Active Branches

Last updated: 2026-05-17

## Branch Status

| Branch | Upstream | Divergence | Status | Owner | Recommended Action |
| --- | --- | --- | --- | --- | --- |
| `codex/p0-production-clean` | `origin/codex/p0-production-clean` | ahead 1 | active release branch | Codex | Push after final review. |
| `main` | `origin/main` | synced | production baseline | team | Keep protected. |
| `codex/ui-ux-responsive-deploy` | none | `1 / 1` vs active branch | paused experiment | Codex | Review `680a50e`; merge or archive. |
| `codex/seo-agentic-runtime` | `origin/main` | `4 / 4` vs active branch | paused experiment | Codex | Review as high-risk broad branch. |
| `codex/seo-agentic-foundation` | none | `4 / 4` vs active branch | paused experiment | Codex | Review as AI/SEO branch. |
| `codex/seo-foundation` | none | merged | cleanup candidate | Codex | Delete locally after confirmation. |

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
