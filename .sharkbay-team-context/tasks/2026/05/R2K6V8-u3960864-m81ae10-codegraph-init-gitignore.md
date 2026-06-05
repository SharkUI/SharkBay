---
kind: sharkbay_task
taskId: R2K6V8-u3960864-m81ae10
taskTag: R2K6V8
mode: task
title: Add .codegraph to project .gitignore after codegraph init
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 2117c1ca-b46e-41c6-95c1-423db5652cb3
branch: main
createdAt: 2026-05-27T04:13:55Z
updatedAt: 2026-05-27T04:15:43Z
completedAt: 2026-05-27T04:15:43Z
commits:
  - a2aa8c3c
  - d0d87f03
---

## Summary
SharkBay manages the `.codegraph` entry in a project's `.gitignore`: adds it after `codegraph init`, removes it when the extension is disabled/index removed.

## Files
- src/core/codegraph-manager.ts
- tests/codegraph-manager.test.ts

## Work
- Added `ensureGitignoreEntry` helper — creates or appends to `.gitignore`, skipping if entry already present.
- Added `removeGitignoreEntry` helper — removes matching lines from `.gitignore`.
- Called `ensureGitignoreEntry` after `codegraph init`.
- Called `removeGitignoreEntry` in `removeProjectIndex` (disable/uninit path).
- Both calls are best-effort (`.catch(() => {})`).
- 12 tests total: 5 for ensure, 3 for remove, 4 existing.

## Verification
- `npx tsc --noEmit -p tsconfig.node.json` — clean
- `npx vitest run tests/codegraph-manager.test.ts` — 12/12 pass

## Notes
- `codegraph init` itself creates `.codegraph/.gitignore` to protect db files, but never touches the project root `.gitignore`.
- Both helpers are best-effort so failures don't block init/uninit flows.
