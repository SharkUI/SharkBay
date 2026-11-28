---
kind: sharkbay_task
taskId: M8Q7K4-u0-m666b54
taskTag: M8Q7K4
mode: task
title: Apply merge decisions for PRs 19 through 22
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 666b54
agent: Codex GPT-6
sessionId: 01a21155-b110-7cf0-8fe8-e3226c74a53b
branch: main
createdAt: 2026-11-25T07:22:08Z
updatedAt: 2026-11-25T07:30:52Z
completedAt: 2026-11-25T07:26:10Z
commits:
  - 9868b785d4d3e133fddd0745d7150ddad7b676da
  - e7ed8642e89fdf93cc373d2f67754718a5924056
  - cce413618984bd576c7e7bbb6e99f307cd941a9f
  - 0a82ae2d0633ba5e4075822713870c60eb7230b5
  - d60d0afacff6871fe6e9a49864e1f0f9da033a0a
---

## Summary
Closed #19, merged #21, and fixed and merged #20 and #22. Local main matches origin/main.

## Files
- GitHub PRs #19, #20, #21, #22.

- src/runtime/control-client.ts
- src/runtime/control-server.ts
- tests/web-runtime-integration.test.ts
- src/renderer/App.tsx
- scripts/verify-shared-runtime.mjs

- src/styles/app.css
- src/renderer/bridge/web-bridge.ts
- src/renderer/terminal-observer.ts
- src/runtime/terminal-state.ts
- src/shared/xterm-mouse.ts
- docs/current-facts.md

## Work
- User approved the recommendations from Q4M7K2-u0-m666b54.

- Squash-merged #21 at 9868b78, closed #19, and fast-forwarded local main.
- Resolved #20 conflicts and added hello capability negotiation with a legacy fallback. Added a disconnect guard and UI regression for #22.

- Pushed the verified fixes to the existing PR branches via fast-forward pushes.

- Squash-merged #20 and #22 after combined verification and removed the temporary Git worktrees.

## Verification
- #20 passed typecheck and all 23 integration tests, including the legacy handshake and continued socket use.
- #22 passed typecheck and shared Electron/Chromium Runtime verification, including short disconnection and recovery.

- Combined tree passed typecheck, all 23 integration tests and shared Electron/Chromium verification. Git diff confirmed the tested source tree matches final main. GitHub confirmed expected states for all four PRs.

## Notes
