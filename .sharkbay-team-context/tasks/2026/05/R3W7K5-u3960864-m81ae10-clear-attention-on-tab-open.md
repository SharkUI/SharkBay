---
kind: sharkbay_task
taskId: R3W7K5-u3960864-m81ae10
taskTag: R3W7K5
mode: task
title: Fix Kiro sharkbay agent config to include default tools list
status: completed
completedAt: 2026-05-30T03:47:08Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: b391fb24-23f2-451c-a2b9-2c77593f9e98
branch: main
createdAt: 2026-05-30T03:06:05Z
updatedAt: 2026-05-30T03:47:08Z
---

## Summary
Fixed KiroConnector install() to include the full default tools list in sharkbay.json, so --agent sharkbay behaves identically to kiro_default (tools + hooks). Retains --agent sharkbay injection in App.tsx.

## Files
- src/main/hooks/connectors/kiro.ts
- src/renderer/App.tsx

## Work
- Added DEFAULT_TOOLS constant with Kiro's standard tool set (read, write, shell, aws, etc.)
- install() now sets config.tools = DEFAULT_TOOLS if not already present
- Investigated alternative approaches:
  - settings.json hooks: confirmed Kiro does NOT read hooks from settings.json (manual echo test)
  - kiro_default.json override: hooks fire but Kiro loses default tools when no tools field is present
- Settled on sharkbay.json + --agent sharkbay + full tools list (same as K96RNZ approach but with tools)
- App.tsx --agent sharkbay injection restored in all 3 locations

## Verification
- `npm run typecheck` passes
- `npm test` — 143 tests pass (38 files)
- Manual test: kiro_default.json override does fire hooks (echo test confirmed)
- Pending: rebuild and verify Kiro can use tools with --agent sharkbay + tools list

## Notes
- Kiro CLI does not read hooks from ~/.kiro/settings.json
- Kiro CLI does not inherit built-in tools when an agent config omits the tools field — must be explicit
- The sharkbay agent config must include the full default tools list to avoid breaking tool usage
- If Kiro adds/removes built-in tools in future, DEFAULT_TOOLS may need updating
