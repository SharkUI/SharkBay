---
kind: sharkbay_task
taskId: R7W4M2-u3960864-m81ae10
taskTag: R7W4M2
mode: quick
title: Fix OpenCode CLI detection
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
createdAt: 2026-05-17T13:13:33Z
updatedAt: 2026-05-17T13:16:15Z
completedAt: 2026-05-17T13:16:15Z
commit: 404cbb7f
---

## Summary

Added `.opencode/bin` to the fallback command directories so SharkBay detects the OpenCode CLI when launched from Finder with a sparse PATH.

## Files

- src/main/command-path.ts

## Work

- Identified that `opencode` is installed at `~/.opencode/bin/opencode`, which was not in the fallback search list.
- Added `.opencode/bin` to `fallbackCommandDirectories` in `command-path.ts`.

## Verification

- `vitest run tests/agent-clis.test.ts` — 2 tests passed.
- `npm run typecheck` — no errors.

## Notes

- OpenCode uses its own install directory (`~/.opencode/bin/`) rather than a standard location like `~/.local/bin`.
