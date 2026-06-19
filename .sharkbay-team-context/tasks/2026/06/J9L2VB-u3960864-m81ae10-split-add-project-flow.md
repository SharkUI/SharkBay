---
kind: sharkbay_task
taskId: J9L2VB-u3960864-m81ae10
taskTag: J9L2VB
mode: task
title: Split add project flow
status: completed
completedAt: 2026-06-19T13:37:41Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019edffd-3e46-70b2-896b-603fbf66cd02
branch: main
createdAt: 2026-06-19T13:30:31Z
updatedAt: 2026-06-19T13:37:41Z
---

## Summary
Split Add Project into Local Directory and Remote Repo choices. Remote Repo now clones into a user-selected parent directory before adding the cloned folder as a project.

## Files
- .sharkbay/tasks/J9L2VB-u3960864-m81ae10-split-add-project-flow.md
- electron/ipc.ts
- electron/preload.mts
- src/main/project-clone.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- src/styles/app.css
- tests/ipc-channels.test.ts

## Work
- User confirmed Add Project should change, not only remove Clone Remote from existing projects.
- Reviewed related team context H7Q4RM-u3960864-m81ae10 and W2N8K4-u3960864-m81ae10.
- Planning a small split flow: Local Directory keeps the existing picker; Remote Repo clones first, then adds the cloned directory as a project.
- Added `config:cloneProject` IPC/preload/bridge support and a main-process `git clone` helper.
- Changed Dashboard Add Project buttons to open a Local Directory / Remote Repo modal.
- Kept the existing-project Git panel clone action removed from H7Q4RM.

## Verification
- `rg -n "onAddProject|async function addProject\\(|Clone Remote|git clone .*\\." src electron tests` — no matches.
- `npx tsc -p tsconfig.renderer.json --noEmit` — passed.
- `npx vitest run tests/ipc-channels.test.ts` — passed.
- `codegraph affected electron/ipc.ts electron/preload.mts src/main/project-clone.ts src/renderer/App.tsx src/renderer/types.ts src/shared/ipc-channels.ts src/shared/types.ts src/styles/app.css tests/ipc-channels.test.ts` — affected test: `tests/ipc-channels.test.ts`.
- `npm run typecheck` — blocked by existing `tests/harness.test.ts` share/artifact rename errors outside this Add Project change.

## Notes
- Remote Repo should clone before project initialization writes hidden project files.
- Working tree also contained unrelated dirty share/artifact migration edits in files touched by this task; they were not reverted.
