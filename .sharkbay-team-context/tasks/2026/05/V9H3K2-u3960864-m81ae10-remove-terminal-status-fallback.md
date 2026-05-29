---
kind: sharkbay_task
taskId: V9H3K2-u3960864-m81ae10
taskTag: V9H3K2
mode: task
title: Remove terminal status fallback
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e73e3-adb3-7f00-b847-49a082641e5d
branch: main
createdAt: 2026-05-29T13:56:30Z
updatedAt: 2026-05-29T13:58:45Z
completedAt: 2026-05-29T13:56:30Z
commits:
  - 24118d98
---

## Summary
Removed the renderer-side terminal-output fallback for project activity so SharkBay project cards rely only on hook-driven agent status. This prevents CodeWhale's idle TUI refreshes from being inferred as `working`.

## Files
- src/main/hooks/bridge.ts
- src/main/hooks/connectors/codewhale.ts
- src/main/hooks/state-manager.ts
- src/renderer/App.tsx
- src/renderer/workflow.ts
- src/styles/app.css
- tests/renderer-workflow.test.ts
- tests/codewhale-hooks.test.ts

## Work
- Searched team context and related this work to H7K9P2-u3960864-m81ae10 and S9H4OK-u3960864-m81ae10.
- Removed terminal output burst, quiet timer, and input-observation based project activity inference from the renderer.
- Simplified project card activity aggregation to use only hook state from `agents:onStatus`.
- Kept terminal output rendering and service URL detection, but removed tab-level working/done/attention states derived from terminal output.
- Updated CodeWhale hook handling so `session_start` is idle and `on_error` maps to attention.
- Removed fallback-specific workflow helpers, CSS states, and tests.

## Verification
- `npm run typecheck` passes.
- `npm test -- tests/renderer-workflow.test.ts tests/terminal.test.ts tests/codewhale-hooks.test.ts` passes: 3 files, 22 tests.
- `npm test` passes: 37 files, 137 tests.
- `npm run pack` passes and produces `release/mac-arm64/SharkBay.app`.
- Packaged renderer asar no longer contains fallback identifiers including `projectTerminalActivityStates`, `mergeProjectActivityStates`, `shouldRecordTerminalOutputActivity`, `outputBurstStartedAt`, `terminalWorkingThresholdMs`, `terminalQuietDoneMs`, or `activityState`.

## Notes
- This intentionally supersedes the terminal-output project-card behavior from K9P2V4-u3960864-m81ae10.
- Hook-only project status depends on the hook-based status system from H7K9P2-u3960864-m81ae10 and the CodeWhale hook forwarding fixes from S9H4OK-u3960864-m81ae10.
- Commit 24118d98 contains the source and test changes for this task.
