---
kind: sharkbay_task
taskId: N9P2Q6-u3960864-m81ae10
taskTag: N9P2Q6
mode: quick
title: Hide Teamwork pending count
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent:
createdAt: 2026-05-17T02:36:43Z
updatedAt: 2026-05-17T02:37:53Z
completedAt: 2026-05-17T02:37:53Z
---

## Summary
Remove Teamwork pending-sync prompts from user-facing UI while keeping error display intact.

## Files
- src/renderer/App.tsx
- docs/teamwork.md

## Work
- Checked team context for overlapping pending-count work.
- Removed pending sync count from the TEAM facts card.
- Treat completed local tasks that are not yet synced as `Done` in task pills; sync failures still show `Sync failed`.
- Updated Teamwork docs to stop advertising the pending sync count.

## Verification
- `npm run typecheck`
- `npm test -- tests/renderer-workflow.test.ts tests/teamwork-tasks.test.ts tests/teamwork-sync.test.ts`
- `git diff --check`

## Notes
- Worktree was clean before starting.
