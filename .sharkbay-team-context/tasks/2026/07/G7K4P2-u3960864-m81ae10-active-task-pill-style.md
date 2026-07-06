---
kind: sharkbay_task
taskId: G7K4P2-u3960864-m81ae10
taskTag: G7K4P2
mode: quick
title: Active task pill style
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f36e1-a31d-7cb0-b7b1-299877d93ce7
branch: main
createdAt: 2026-07-06T10:04:51Z
updatedAt: 2026-07-06T10:05:48Z
completedAt: 2026-07-06T10:05:48Z
---

## Summary
Project detail task `Active` pills now use a solid green background with white text, making them distinct from the lighter `Done` pills.

## Files
- src/renderer/App.tsx
- src/styles/app.css
- .sharkbay/tasks/G7K4P2-u3960864-m81ae10-active-task-pill-style.md

## Work
- Started task to make project-detail task `Active` pills visually distinct from `Done` pills.
- Reviewed related team task `N9P2Q6-u3960864-m81ae10`, which previously adjusted task pill status behavior.
- Changed active task pills to use a dedicated `phase-active` class.
- Added green-background, white-text styling for `phase-active`, including night theme coverage.

## Verification
- `git diff --check -- src/renderer/App.tsx src/styles/app.css .sharkbay/tasks/G7K4P2-u3960864-m81ae10-active-task-pill-style.md`
- `npm run typecheck`

## Notes
- Assumption: only the project-detail task status pill styling should change; no task status logic changes are intended.
- No commit was produced for this task.
