---
kind: sharkbay_task
taskId: T6R8M4-u3960864-m81ae10
taskTag: T6R8M4
mode: task
title: Terminal tab shortcut drag
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e90c2-5779-7f61-9661-3add9ca6cdef
branch: main
createdAt: 2026-06-04T04:20:42Z
updatedAt: 2026-06-04T04:36:46Z
completedAt: 2026-06-04T04:36:46Z
commits:
  - 11945100affc9ace6a2b44beddecf194980eedb1
---

## Summary
Added Command+T as an application-level shortcut for opening a new shell terminal tab in the current project, and added mouse drag reordering for tabs in the terminal tab strip while keeping the default cursor over tabs.

## Files
- .sharkbay/tasks/T6R8M4-u3960864-m81ae10-terminal-tab-shortcut-drag.md
- electron/main.ts
- electron/preload.mts
- src/main/application-menu.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/app-events.ts
- src/styles/app.css
- tests/application-menu.test.ts

## Work
- Started task after checking team context for related terminal tab shortcut, focus, and drag work.
- Related context: `M8Q2R6-u3960864-m81ae10`, `H8K2V6-u3960864-m81ae10`, and `S4L9H2-u3960864-m81ae10`.
- CodeGraph located terminal tab rendering and tab identity helpers in `TerminalPane` / `tabIdForTab`.
- Planned to reuse the existing `openCurrentProjectTab` path for Command+T and add pointer-based reorder only inside the current tab strip.
- Found the existing app-menu event path for Settings and chose to reuse it for an application-level Command+T accelerator.
- Added `app:newTerminalTab` through the app menu, main-process forwarding, preload subscription, and renderer bridge type.
- Subscribed `TerminalPane` to the app event and reused `openCurrentProjectTab` so the shortcut opens a shell terminal in the current project.
- Added pointer capture based horizontal tab reordering and a lightweight dragging cursor state; close buttons stop pointer propagation so they do not start drags.
- Adjusting terminal tab hover/drag cursor styling to keep the default arrow.
- Found the remaining hand cursor came from button-level cursor styling.
- Removed the global `button { cursor: pointer; }` rule so buttons default to the arrow unless locally overridden.
- Preparing a commit for the verified terminal shortcut, tab drag, and cursor changes.

## Verification
- `codegraph affected electron/main.ts electron/preload.mts src/main/application-menu.ts src/renderer/App.tsx src/renderer/types.ts src/shared/app-events.ts src/styles/app.css tests/application-menu.test.ts`
- `git diff --check -- electron/main.ts electron/preload.mts src/main/application-menu.ts src/renderer/App.tsx src/renderer/types.ts src/shared/app-events.ts src/styles/app.css tests/application-menu.test.ts .sharkbay/tasks/T6R8M4-u3960864-m81ae10-terminal-tab-shortcut-drag.md`
- `npm run typecheck`
- `npm test -- tests/application-menu.test.ts tests/renderer-workflow.test.ts`
- `git diff --check -- src/styles/app.css .sharkbay/tasks/T6R8M4-u3960864-m81ae10-terminal-tab-shortcut-drag.md`
- `rg -n "^button \\{" src/styles/app.css || true`

## Notes
- Treat `.sharkbay/team-context/` as read-only.
- Commit produced: `11945100affc9ace6a2b44beddecf194980eedb1`.
