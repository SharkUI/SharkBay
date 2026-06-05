---
kind: sharkbay_task
taskId: V7M3K8-u3960864-m81ae10
taskTag: V7M3K8
mode: task
title: Fix KiroConnector to install hooks into agent config
status: completed
completedAt: 2026-05-30T02:24:53Z
commits:
  - 0a617b37
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro CLI
branch: main
createdAt: 2026-05-30T02:23:30Z
updatedAt: 2026-05-30T02:24:53Z
---

## Summary
Fixed KiroConnector to write hooks into `~/.kiro/agents/sharkbay.json` (Kiro agent config) instead of `~/.kiro/settings.json` which Kiro CLI does not read for hooks.

## Files
- src/main/hooks/connectors/kiro.ts

## Work
- Changed configPath from `~/.kiro/settings.json` to `~/.kiro/agents/sharkbay.json`
- detect() now checks `~/.kiro/agents/` directory exists
- install() creates a proper agent config with name/description/hooks fields
- Hook entries use Kiro's format: `{ command, timeout_ms, _managedBy }` (removed `type` field, renamed `timeout` to `timeout_ms`)
- normalize() unchanged — already correctly parses Kiro's hook_event_name payloads

## Verification
- npm run typecheck: passes
- npm test: 142 tests pass (38 files)

## Notes
- Kiro CLI reads hooks from agent config files, not settings.json
- The created agent can be used with `kiro-cli chat --agent sharkbay` or set as default
- Built-in agents (kiro_default) cannot be edited, hence a dedicated sharkbay agent config
- After this fix, user needs to re-install hooks from SharkBay UI for Kiro to pick them up
- Related: K2W8R4-u3960864-m81ae10 (hook state flicker fix)
