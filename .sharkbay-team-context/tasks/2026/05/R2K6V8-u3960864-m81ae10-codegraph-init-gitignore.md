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
---

## Summary
After `codegraph init` succeeds, SharkBay now ensures `.codegraph` is listed in the project's root `.gitignore` so the index directory is never untracked.

## Files
- src/core/codegraph-manager.ts
- tests/codegraph-manager.test.ts

## Work
- Added `ensureGitignoreEntry` helper that creates or appends to `.gitignore`, skipping if the entry (with or without trailing slash) already exists.
- Called it after `codegraph init` with `.catch(() => {})` so gitignore failures don't break the init flow.
- Added 5 tests covering: new file creation, append, dedup, trailing-slash recognition, missing trailing newline.

## Verification
- `npx tsc --noEmit -p tsconfig.node.json` — clean
- `npx vitest run tests/codegraph-manager.test.ts` — 9/9 pass

## Notes
- `codegraph init` itself creates `.codegraph/.gitignore` to protect db files, but never touches the project root `.gitignore`.
- The helper is best-effort (swallowed errors) so edge cases like read-only filesystems don't block indexing.
