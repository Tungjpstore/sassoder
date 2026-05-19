# LogiVN Release Notes

## Unreleased

### Changed

- Cleaned stale Git worktree metadata and restored a single active local worktree.
- Added repository hygiene docs for worktrees, active branches, migrations, and release notes.
- Updated project handoff metadata to point at the current integration branch.

### Operational Notes

- Current integration branch: `codex/p0-production-clean`
- Current release commit: `531a181 chore: consolidate LogiVN production release`
- Branch is ahead of `origin/codex/p0-production-clean` by 1 commit.
- `git push --dry-run origin codex/p0-production-clean` succeeded during the 2026-05-17 audit.

### Remaining Risks

- `.git/objects` contains many large loose objects; run Git object cleanup only after the release commit is pushed or otherwise backed up.
- Three paused experiment branches remain unmerged:
  - `codex/ui-ux-responsive-deploy`
  - `codex/seo-agentic-runtime`
  - `codex/seo-agentic-foundation`

## 2026-05-17 Local Production Consolidation

### Added

- Platform admin RBAC foundation.
- Staff operations, attendance, inventory, AI operations, SEO intent pages, and production hardening work consolidated into the active release branch.

### Validation

- Latest handoff records local validation passing:
  - `git diff --check`
  - `npm run lint`
  - `npx tsc --noEmit --pretty false --incremental false`
  - `npm test`
  - `NEXT_PRIVATE_BUILD_WORKER=0 npm run build`

### Rollback

- If the release branch causes issues before push, stay on `origin/codex/p0-production-clean` at `5256d81`.
- If pushed and a rollback is needed, create a revert commit instead of force-pushing over shared history.
