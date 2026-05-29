---
kind: sharkbay_task
taskId: S9H4OK-u3960864-m81ae10
taskTag: S9H4OK
mode: task
title: Inspect CodeWhale status hooks
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e73c9-b1e1-7d41-ab7f-de3ec793be10
branch: main
createdAt: 2026-05-29T12:53:49Z
updatedAt: 2026-05-29T13:11:51Z
completedAt: 2026-05-29T13:11:51Z
---

## Summary
Fixed the CodeWhale status hook forwarding path so generated hooks use the active HookBridge socket path and emit payload fields that the CodeWhale connector can normalize. Added regression coverage for CodeWhale env-based hook payloads and project hook-state application.

## Files
- src/main/hooks/bridge.ts
- src/main/hooks/connectors/codewhale.ts
- tests/codewhale-hooks.test.ts

## Work
- Found related team-context task H7K9P2-u3960864-m81ae10 for the hook-based agent status system.
- Confirmed CodeWhale uses environment variables for hooks and SharkBay's generated payload currently lacks the `type` and `cwd` fields expected by `CodeWhaleConnector.normalize()`.
- Updated generated hook scripts to embed the active socket-path file instead of hardcoding the production app support path.
- Updated CodeWhale normalization to accept `hook_event`, `workspace`, and `session_id` payloads produced from CodeWhale hook environment variables.
- Added targeted tests for CodeWhale normalization, state-manager application, and generated script content.

## Verification
- `npm test -- tests/codewhale-hooks.test.ts` passes.
- `npm run typecheck` passes.
- `npm test` passes: 37 files, 138 tests.

## Notes
- User observed waiting for input showing as working, authorization waits not showing attention, and idle status behaving incorrectly.
- CodeWhale v0.8.47 exposes hook events for session/message/tool/mode/error/shell-env, but not approval or user-input lifecycle events; attention for approval waits likely needs upstream hook support or a separate SharkBay detector.
