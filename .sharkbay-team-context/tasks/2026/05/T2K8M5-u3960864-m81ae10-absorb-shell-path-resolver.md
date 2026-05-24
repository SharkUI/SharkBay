---
kind: sharkbay_task
taskId: T2K8M5-u3960864-m81ae10
taskTag: T2K8M5
mode: task
title: Absorb shell PATH resolver from PR #9
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: f6c613a6-5822-41d0-b4e1-61b67036f490
branch: main
createdAt: 2026-05-24T03:47:06Z
updatedAt: 2026-05-24T03:52:00Z
completedAt: 2026-05-24T03:52:00Z
commit: 608a4055
---

## Summary
Upgrade command-path.ts internal implementation to use interactive shell PATH loading with caching, absorbing the approach from PR #9 while keeping our fallback directories as safety net.

## Files
- src/main/command-path.ts
- tests/command-path.test.ts (if applicable)

## Work
- Replaced hardcoded `/bin/zsh -lc command -v` with multi-shell detection (`$SHELL` → fish or posix).
- Added `getShellPaths()` with `-lic` interactive login mode, 5s timeout, 60s TTL cache per home dir.
- Added `discoverFnmBinDirectories()` to scan `~/.local/share/fnm/node-versions/*/installation/bin`.
- Added `.volta/bin` and `.asdf/shims` to hardcoded fallback list.
- Kept `.opencode/bin` and all existing fallback directories as last resort.
- Search order: shell PATH → fnm directories → hardcoded fallbacks.

## Verification
- `npm run typecheck`: clean.
- `npm test`: 37 files, 119 tests passed (includes agent-clis.test.ts).

## Notes
- PR #9 uses $SHELL interactive login mode to load full PATH, cached 60s, with fnm/volta/asdf scan.
- We keep our existing fallback directories (.opencode/bin etc.) as last resort.
- Related tasks: H6V2K9, R7W4M2, N4P7KQ.
