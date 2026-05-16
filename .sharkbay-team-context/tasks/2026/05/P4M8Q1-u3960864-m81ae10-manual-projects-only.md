---
kind: sharkbay_task
taskId: P4M8Q1-u3960864-m81ae10
taskTag: P4M8Q1
mode: task
title: Manual projects only
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent:
createdAt: 2026-05-16T13:39:18Z
updatedAt: 2026-05-16T13:51:17Z
completedAt: 2026-05-16T13:51:17Z
---

## Summary
Changed project management to support only manually added projects. Added project removal from the left project-card context menu and Settings with a confirmation dialog that does not delete files from disk.

## Files
- README.md
- docs/agents.md
- docs/architecture.md
- docs/development.md
- docs/product.md
- docs/roadmap.md
- docs/testing.md
- electron/ipc.ts
- electron/preload.mts
- src/main/config.ts
- src/main/path-safety.ts
- src/main/project-files.ts
- src/main/scanner.ts
- src/main/terminal.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- tests/ipc-channels.test.ts
- tests/project-files.test.ts
- tests/scanner.test.ts
- tests/terminal.test.ts

## Work
- Checked team context for overlapping project-management work.
- Removed scan-root management from the renderer and public preload/IPC API; project scan now resolves only persisted `configuredProjects`.
- Re-scoped project detail, file tree, terminal, and Teamwork IPC path checks to manually configured projects.
- Added remove-project flow from the left project context menu and Settings, with a blocking confirmation dialog.
- Updated README/docs to describe manual-only project management and removal behavior.

## Verification
- `npm test -- tests/scanner.test.ts tests/project-files.test.ts tests/terminal.test.ts tests/ipc-channels.test.ts tests/path-safety.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run build` (passes; Vite still reports the existing >500 kB chunk warning)
- `git diff --check`

## Notes
- Worktree was clean before starting.
- No commit has been created for this task yet.
