---
kind: sharkbay_task
taskId: T5R8K2-u3960864-m81ae10
taskTag: T5R8K2
mode: task
title: Fix TEAM task refresh
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent:
createdAt: 2026-05-17T02:40:02Z
updatedAt: 2026-05-17T02:44:38Z
completedAt: 2026-05-17T02:44:38Z
---

## Summary
Fixed TEAM task list and task detail refresh so local task file edits appear without switching projects.

## Files
- src/renderer/App.tsx
- docs/teamwork.md

## Work
- Checked team context for overlapping task refresh work.
- Added periodic TEAM task/status refresh for the selected project, with toast notifications only on initial load failures.
- Changed selected task detail state to track `taskId` and derive the displayed task from the latest task list, eliminating stale detail objects.
- Kept pending sync hidden from normal UI while preserving sync failure/error display.

## Verification
- `npm run typecheck`
- `npm test -- tests/renderer-workflow.test.ts tests/teamwork-tasks.test.ts tests/teamwork-sync.test.ts`
- `npm test`
- `git diff --check`

## Notes
- Existing uncommitted changes already hide Teamwork pending sync prompts.
