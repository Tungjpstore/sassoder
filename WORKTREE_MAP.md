# LogiVN Worktree Map

Last updated: 2026-05-17

## Current State

| Worktree | Branch | HEAD | Status | Notes |
| --- | --- | --- | --- | --- |
| `/Users/tunbee27/Documents/New project` | `codex/p0-production-clean` | `531a181` | active | Clean working tree, ahead of `origin/codex/p0-production-clean` by 1 commit. |

## Cleanup Completed

- Pruned stale Git worktree metadata for removed `/private/tmp` worktrees:
  - `logivn-payment-release`
  - `logivn-week4-seo-deploy`
  - `logivn-ui-ux-deploy`
- Verified `git worktree prune --dry-run --verbose` now reports no cleanup candidates.
- No branch was deleted during this cleanup.

## Branches Without Active Worktrees

| Branch | Status | Action |
| --- | --- | --- |
| `codex/ui-ux-responsive-deploy` | unmerged experiment | Review or recreate worktree before merging. |
| `codex/seo-agentic-runtime` | unmerged experiment | Review carefully; broad AI/SEO/runtime changes. |
| `codex/seo-agentic-foundation` | unmerged experiment | Review carefully; AI/SEO foundation changes. |
| `codex/seo-foundation` | merged | Safe local delete candidate after confirmation. |
| `main` | merged baseline | Keep. |

## Standard Commands

Audit:

```bash
git status --short --branch
git worktree list --porcelain
git worktree prune --dry-run --verbose
git branch -vv --all --sort=-committerdate
```

Create a focused worktree:

```bash
git worktree add ../logivn-feature-name -b codex/feature-name codex/p0-production-clean
```

Recreate the UI experiment worktree if needed:

```bash
git worktree add /private/tmp/logivn-ui-ux-deploy codex/ui-ux-responsive-deploy
```

Safe metadata cleanup:

```bash
git worktree prune --verbose
```

## Safety Rules

- Do not delete unmerged branches without checking `git log HEAD..branch-name`.
- Do not run `git gc --prune=now` before the current release commit is pushed or backed up.
- Keep one feature per branch/worktree.
- Prefer short-lived `codex/*` branches for AI-assisted implementation threads.
- Document each active branch in `ACTIVE_BRANCHES.md` before handing it to another thread.
