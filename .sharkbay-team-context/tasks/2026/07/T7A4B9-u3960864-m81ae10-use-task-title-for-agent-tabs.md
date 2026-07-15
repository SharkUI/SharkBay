---
kind: sharkbay_task
taskId: T7A4B9-u3960864-m81ae10
taskTag: T7A4B9
mode: task
title: Use task titles for agent terminal tabs
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
branch: main
createdAt: 2026-07-15T11:16:34Z
updatedAt: 2026-07-15T11:20:03Z
completedAt: 2026-07-15T11:20:03Z
---

## Summary
Agent terminal tabs now display the newest associated task title, shortened to ten Unicode graphemes plus `...` when needed. Task changes update the title live while native terminal, Island, and persistence titles remain unchanged.

## Files
- .sharkbay/tasks/T7A4B9-u3960864-m81ae10-use-task-title-for-agent-tabs.md
- src/renderer/App.tsx
- src/shared/task-detail-helpers.ts
- tests/task-detail-helpers.test.ts

## Work
- Started implementation after reviewing the terminal title, task watcher, tab persistence, and hook session mapping paths.
- Kept scope to renderer tab display titles; native terminal titles, Island titles, and persisted agent launch titles remain unchanged.
- Related prior tasks: J5L8N2-u3960864-m81ae10, T6R9P4-u3960864-m81ae10, and EK9656-u3960864-m81ae10.
- Added task helpers that select the newest task per sessionId and truncate display titles to ten Unicode graphemes without splitting emoji.
- Loaded tasks for projects with agent tabs and reused the existing task-change event to keep renderer title indexes current.
- Derived the visible tab title from the hook session mapping while preserving the native terminal title as the fallback and persistence source.

## Verification
- `npx vitest run tests/task-detail-helpers.test.ts` passed (7 tests).
- `npm run typecheck` passed.
- `npx vitest run tests/task-detail-helpers.test.ts tests/renderer-workflow.test.ts` passed (15 tests).
- `codegraph affected src/renderer/App.tsx src/shared/task-detail-helpers.ts tests/task-detail-helpers.test.ts` identified the updated helper test as affected.
- `git diff --check -- src/renderer/App.tsx src/shared/task-detail-helpers.ts tests/task-detail-helpers.test.ts` passed.
- `npm test` passed (60 files, 337 tests).
- `npm run build` passed.
- Final `git diff --check` and scope review passed; the pre-existing src/styles/app.css change remains separate and untouched by this task.
- Live association was not demonstrated because this Codex session had no discoverable hook sessionId; unassociated tabs intentionally retain their native title.

## Notes
- Preserve the unrelated existing src/styles/app.css modification from task R7F3Q9-u3960864-m81ae10.
- Tasks without a reliable sessionId must not be heuristically associated with a terminal tab.
