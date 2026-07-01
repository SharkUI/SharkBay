---
kind: sharkbay_task
taskId: RV90J9-u3960864-m81ae10
taskTag: RV90J9
mode: quick
title: Internal browser new window
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
branch: main
createdAt: 2026-07-01T14:49:18Z
updatedAt: 2026-07-01T14:53:31Z
completedAt: 2026-07-01T14:53:31Z
---

## Summary
Built-in browser new-window requests now create and activate another internal browser tab instead of opening the URL in the external default browser.

## Files
- .sharkbay/tasks/RV90J9-u3960864-m81ae10-internal-browser-new-window.md
- electron/ipc.ts
- src/main/browser-tabs.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/types.ts
- tests/browser-tabs.test.ts

## Work
- Started task to make internal browser new-window link clicks open another internal browser instead of the external browser.
- Assumption: only target=_blank/window.open style navigation should change; normal same-window navigation should remain unchanged.
- Changed BrowserManager new-window handling to create a new internal browser session and emit a created browser update instead of calling shell.openExternal.
- Routed created browser updates only to the owning Electron window and taught the renderer to append and activate the new browser tab.
- Added a focused unit test for the new-window handler behavior.

## Verification
- `npm test -- browser-tabs`
- `npm run typecheck`
- `codegraph affected src/main/browser-tabs.ts electron/ipc.ts src/renderer/App.tsx src/shared/types.ts src/renderer/types.ts tests/browser-tabs.test.ts`
- `npm test`

## Notes
- Searched team context for browser/new-window/external handling before editing; no exact prior task was found.
- No commit was produced.
