---
kind: sharkbay_task
taskId: R3W7K5-u3960864-m81ae10
taskTag: R3W7K5
mode: task
title: Move Kiro hooks back to settings.json and remove --agent sharkbay injection
status: completed
completedAt: 2026-05-30T03:07:29Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: b391fb24-23f2-451c-a2b9-2c77593f9e98
branch: main
createdAt: 2026-05-30T03:06:05Z
updatedAt: 2026-05-30T03:07:29Z
---

## Summary
Revert KiroConnector to install hooks into ~/.kiro/settings.json (global hooks) with correct format, and remove the --agent sharkbay injection from App.tsx. This fixes the unintended side effect where --agent sharkbay overrides Kiro's default agent, routing all tool usage through the sharkbay agent profile.

## Files
- src/main/hooks/connectors/kiro.ts
- src/renderer/App.tsx

## Work
- Revert KiroConnector configPath to ~/.kiro/settings.json with correct entry format (command + timeout_ms, no type field)
- Remove --agent sharkbay injection from openAgentProjectTab, SessionsDetailTab, and taskRestoreCommand in App.tsx

## Verification
- `npm run typecheck` passes
- `npm test` — 143 tests pass (38 files)

## Notes
- Prior task V7M3K8 moved hooks from settings.json to agents/sharkbay.json claiming Kiro doesn't read settings.json hooks — the real issue was incorrect entry format (had `type` field, used `timeout` instead of `timeout_ms`)
- Prior task K96RNZ added --agent sharkbay to compensate, but this made sharkbay the active agent profile, breaking default tool behavior
- With hooks in settings.json (correct format), they fire globally for any agent — no --agent flag needed
