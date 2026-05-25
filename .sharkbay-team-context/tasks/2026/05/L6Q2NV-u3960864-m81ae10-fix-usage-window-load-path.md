---
kind: sharkbay_task
taskId: L6Q2NV-u3960864-m81ae10
taskTag: L6Q2NV
mode: quick
title: Fix usage window load path
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e5f25-42dc-7383-89e5-ebbb479bc38c
branch: main
createdAt: 2026-05-25T13:24:35Z
updatedAt: 2026-05-25T13:25:57Z
completedAt: 2026-05-25T13:25:57Z
---

## Summary
Fixed the token usage detail window choosing the packaged `dist/renderer/usage-window.html` path during development. The window now matches the main window behavior by using the Vite dev server unless `app.isPackaged` is true.

## Files
- electron/usage-window.ts
- .sharkbay/tasks/L6Q2NV-u3960864-m81ae10-fix-usage-window-load-path.md

## Work
- Reviewed team context task T8M3X5 for the token usage detail window implementation.
- Confirmed the current `dist/renderer` directory lacks `usage-window.html`.
- Matched the usage detail window load-path decision to the main window by using `app.isPackaged`.

## Verification
- `npx tsc -p tsconfig.node.json --noEmit` passed.
- `npx tsc -p tsconfig.renderer.json --noEmit` passed.
- `npx vite build` passed and produced `dist/renderer/usage-window.html`.
- `npm test -- tests/ipc-channels.test.ts tests/codex-sessions.test.ts` passed.
- `awk '/[ \t]$/ { print FILENAME ":" FNR; bad=1 } END { exit bad }' electron/usage-window.ts .sharkbay/tasks/L6Q2NV-u3960864-m81ae10-fix-usage-window-load-path.md` passed.

## Notes
- Existing token usage files are dirty from prior work; preserve that work.
