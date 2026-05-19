---
kind: sharkbay_task
taskId: R9T2K6-u3960864-m81ae10
taskTag: R9T2K6
mode: task
title: Restore project panel behavior
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
createdAt: 2026-05-19T12:54:14Z
updatedAt: 2026-05-19T13:07:45Z
completedAt: 2026-05-19T13:07:45Z
---

## Summary
Restored the requested project panel behavior after a pull regression: detail tabs now persist across project switches, project management is manual-project-only, project actions live in the right-click card menu, and the Projects header matches detail tab typography.

## Files
- src/renderer/App.tsx
- src/renderer/types.ts
- src/styles/app.css
- src/main/scanner.ts
- src/main/path-safety.ts
- src/main/project-files.ts
- src/main/project-icons.ts
- electron/ipc.ts
- electron/preload.mts
- src/shared/ipc-channels.ts
- tests/ipc-channels.test.ts
- tests/scanner.test.ts
- tests/project-files.test.ts
- tests/terminal.test.ts
- tests/path-safety.test.ts
- tests/local-provider.test.ts
- tests/node-detector.test.ts
- tests/python-detector.test.ts
- tests/profile-orchestrator.test.ts
- README.md

## Work
- Checked team context and found related manual-project/context-menu history in P4M8Q1-u3960864-m81ae10, plus current TEAM UI history in W6C9P2-u3960864-m81ae10.
- Confirmed current code had regressed to root scanning, ellipsis project menus, and Git tab reset on project switch.
- Removed the project-switch reset to Git and used the previously selected detail tab whenever it is available for the newly selected project.
- Removed scan-root UI/API exposure from the renderer/preload/IPC surface and made `scanProjects` resolve only configured local/remote projects.
- Re-scoped path safety, file listing, project icons, terminal tests, provider tests, and detector tests around configured project boundaries instead of configured roots.
- Replaced the project-card ellipsis trigger with a right-click context menu containing Rename, Uninstall Teamwork for local projects, and Remove Project.
- Matched the left Projects header typography to the uppercase detail tab labels.

## Verification
- `npm run typecheck`
- `npm test -- tests/scanner.test.ts tests/project-files.test.ts tests/terminal.test.ts tests/path-safety.test.ts tests/ipc-channels.test.ts tests/renderer-workflow.test.ts`
- `npm test`
- `git diff --check`
- `npm run build` (passes; Vite still reports the existing >500 kB chunk warning)

## Notes
- Existing uncommitted `src/renderer/App.tsx` changes from the prior Teamwork status card removal are being preserved.
- No commit was produced.
