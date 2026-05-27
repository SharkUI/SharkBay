---
kind: sharkbay_task
taskId: W3K7R9-u3960864-m81ae10
taskTag: W3K7R9
mode: task
title: Move codegraph ignore from .gitignore to .git/info/exclude
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: a10446e4-e8c5-4a41-9864-8549d3d42f70
branch: main
createdAt: 2026-05-27T04:36:36Z
updatedAt: 2026-05-27T04:49:43Z
completedAt: 2026-05-27T04:49:43Z
commits:
  - 036d913e
---

## Summary
Change codegraph ignore entry management to use `.git/info/exclude` instead of `.gitignore`, keeping tool-local state out of the tracked project config.

## Files
- src/core/codegraph-manager.ts
- tests/codegraph-manager.test.ts

## Work
- Renamed `ensureGitignoreEntry` → `ensureGitExcludeEntry`, now writes to `.git/info/exclude`
- Renamed `removeGitignoreEntry` → `removeGitExcludeEntry`, now reads/writes `.git/info/exclude`
- `ensureGitExcludeEntry` creates `.git/info/` directory if missing (ENOENT case)
- `removeGitExcludeEntry` silently ignores missing exclude file
- Updated callers in `readProjectStatusOnce` and `removeProjectIndex`
- Rewrote all tests to use `.git/info/exclude` paths; added edge-case tests for missing dir/file
- Removed `.codegraph` from `.gitignore` (was leftover from prior runs)
- Reopened for commit preparation after confirming the dirty files match this task.
- Committed the CodeGraph exclude change as `036d913e`.

## Verification
- `npx vitest run tests/codegraph-manager.test.ts` — 14 tests pass
- `git diff --check`
- `git diff --cached --check`

## Notes
- `.git/info/exclude` is local-only (not committed), appropriate for tool artifacts like `.codegraph`
- Same approach already used for `.sharkbay/` in this repo
- Codex GPT-5 verified and committed this existing task record.
