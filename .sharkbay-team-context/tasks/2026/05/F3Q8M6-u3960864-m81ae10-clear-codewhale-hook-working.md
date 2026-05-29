---
kind: sharkbay_task
taskId: F3Q8M6-u3960864-m81ae10
taskTag: F3Q8M6
mode: quick
title: Clear CodeWhale hook working
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e73e3-adb3-7f00-b847-49a082641e5d
branch: main
createdAt: 2026-05-29T14:00:19Z
updatedAt: 2026-05-29T14:03:22Z
completedAt: 2026-05-29T14:03:22Z
---

## Summary
Fixed the remaining stale CodeWhale `working` state by treating hook `tool_end` as idle and clearing hook status when an agent terminal exits or is closed.

## Files
- src/main/hooks/state-manager.ts
- src/main/terminal.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/types.ts
- tests/codewhale-hooks.test.ts

## Work
- Related to V9H3K2-u3960864-m81ae10, which removed terminal-output fallback activity inference.
- User observed the project card still showing `working` with `Deepseek: fetch_url done`, and still showing `working` after closing the CodeWhale tab.
- Changed hook state mapping so `tool_end` clears to idle with no action text instead of remaining `working`.
- Exposed terminal `agentId` to the renderer and clear the matching project hook status when an agent terminal exits or is closed.
- Added regression coverage for CodeWhale `tool_call_after` clearing working state.

## Verification
- `npm run typecheck` passes.
- `npm test -- tests/codewhale-hooks.test.ts tests/terminal.test.ts tests/renderer-workflow.test.ts` passes: 3 files, 23 tests.
- `npm test` passes: 37 files, 138 tests.
- `npm run pack` passes and produces `release/mac-arm64/SharkBay.app`.

## Notes
- The screenshot indicates the remaining source is hook state, not terminal-output fallback.
- No commits were produced for this task yet.
