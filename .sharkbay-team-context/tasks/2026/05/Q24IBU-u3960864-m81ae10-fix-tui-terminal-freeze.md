---
kind: sharkbay_task
taskId: Q24IBU-u3960864-m81ae10
taskTag: Q24IBU
mode: task
title: Fix TUI app freeze in terminal by switching input IPC to fire-and-forget
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Sonnet 4
branch: main
createdAt: 2026-05-21T23:06:00+08:00
updatedAt: 2026-05-21T23:08:00+08:00
completedAt: 2026-05-21T23:08:00+08:00
commit: 8d77bfc6
---

## Summary
Switched terminal input IPC from invoke (request-response) to fire-and-forget send to prevent TUI apps like OpenCode from freezing due to IPC congestion in the multi-hop message path.

## Files
- electron/preload.mts
- electron/ipc.ts
- src/renderer/App.tsx
- src/renderer/types.ts

## Work
- Diagnosed OpenCode freeze: Bubble Tea sends terminal queries (DSR, background color, etc.), xterm.js responds via onData, responses traverse multi-hop IPC (renderer → main → utility process → response), causing congestion that blocks all input including Ctrl+C.
- Added `inputFire` method to preload using `ipcRenderer.send` (fire-and-forget).
- Added `ipcMain.on` listener in ipc.ts for the same channel (coexists with existing handle).
- Updated `createXTerm` in App.tsx to prefer `inputFire` over invoke-based `sendTerminalInput`, with fallback.
- Added `inputFire` to the `SharkBayBridge` type in renderer types.

## Verification
- `npm run typecheck` passed (renderer + node configs)
- `npm test` passed (36 test files, 113 tests)

## Notes
- Root cause: terminal input used ipcRenderer.invoke creating request-response overhead; TUI apps generate high-frequency terminal query responses that congest the IPC channel when responses must traverse renderer → main → utility process → response path.
- The invoke-based handler is kept for backward compatibility but the renderer now uses the send-based path.
- Future improvement: could also add output batching/throttling for extreme TUI output scenarios.
