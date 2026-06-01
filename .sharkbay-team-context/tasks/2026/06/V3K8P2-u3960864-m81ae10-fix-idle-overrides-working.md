---
kind: sharkbay_task
taskId: V3K8P2-u3960864-m81ae10
taskTag: V3K8P2
mode: quick
title: Fix project idle pill overriding working state
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 3c966b58-f72d-4ff3-9d9c-f72863f1fb3a
branch: main
createdAt: 2026-06-01T05:54:53Z
updatedAt: 2026-06-01T05:56:03Z
completedAt: 2026-06-01T05:56:03Z
---

## Summary
Fix priorityOf so working > idle — project sidebar shows "working" when any session is active.

## Files
- src/renderer/App.tsx

## Work
- Swap priority values: working=2, idle=1 (was idle=2, working=1)

## Verification
- `npx tsc -p tsconfig.renderer.json --noEmit` — 7 pre-existing errors (all unrelated: createWorktree, ProjectIcon, sources), none from this change

## Notes
- Previous task R2K4V7 set idle>working intentionally but the user confirms that's wrong behavior.
