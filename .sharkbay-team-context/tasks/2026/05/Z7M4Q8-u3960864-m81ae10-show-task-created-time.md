---
kind: sharkbay_task
taskId: Z7M4Q8-u3960864-m81ae10
taskTag: Z7M4Q8
mode: quick
title: Show task created time
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
createdAt: 2026-05-17T11:22:22Z
updatedAt: 2026-05-17T11:25:42Z
completedAt: 2026-05-17T11:24:21Z
commit: 93f0a365
---

## Summary
Added task creation time to the TEAM task list using the same relative time style as Git history entries.

## Files
- src/renderer/App.tsx
- docs/teamwork.md

## Work
- Started from team context task T5R8K2, which recently updated TEAM task refresh behavior.
- Reused the Git history relative time formatter for TEAM task creation time in list rows.
- Updated Teamwork UI documentation to include the task created time.

## Verification
- `npm run typecheck`
- `npm test -- tests/teamwork-tasks.test.ts tests/renderer-workflow.test.ts`
- `git diff --check`

## Notes
- User requested a git commit-style time format for task creation timestamps.
