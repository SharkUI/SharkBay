---
kind: sharkbay_task
taskId: K9P2V4-u3960864-m81ae10
taskTag: K9P2V4
mode: quick
title: Keep working tag on project switch
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
createdAt: 2026-05-20T01:26:59Z
updatedAt: 2026-05-20T01:28:26Z
completedAt: 2026-05-20T01:28:26Z
---

## Summary
Kept project `working` status from disappearing just because the project becomes active. Terminal output now downgrades from `working` to attention/done when it goes quiet, while non-working quiet states clear to idle.

## Files
- .sharkbay/tasks/K9P2V4-u3960864-m81ae10-keep-working-tag-on-switch.md
- src/renderer/App.tsx
- src/renderer/workflow.ts
- tests/renderer-workflow.test.ts

## Work
- Searched team context for related terminal activity and working/attention status history.
- Identified current behavior: quiet timer clears `working` to `idle` when the terminal is the current active tab, which makes the left project tag disappear after selecting the project.
- Updating the terminal quiet transition so `working` downgrades to attention/done regardless of current project selection, instead of disappearing.
- Added a pure workflow helper and test for the quiet transition, then wired `App.tsx` to use it.

## Verification
- `npm test -- tests/renderer-workflow.test.ts`
- `npm run typecheck`
- `git diff --check`

## Notes
- Existing uncommitted renderer changes from `M8T4Q6-u3960864-m81ae10` are in `src/renderer/App.tsx`; this task will build on them without reverting.
