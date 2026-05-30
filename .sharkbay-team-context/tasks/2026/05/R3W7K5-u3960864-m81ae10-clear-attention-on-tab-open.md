---
kind: sharkbay_task
taskId: R3W7K5-u3960864-m81ae10
taskTag: R3W7K5
mode: task
title: Fix Kiro hooks to use kiro_default.json override instead of separate agent
status: completed
completedAt: 2026-05-30T03:20:02Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: b391fb24-23f2-451c-a2b9-2c77593f9e98
branch: main
createdAt: 2026-05-30T03:06:05Z
updatedAt: 2026-05-30T03:20:02Z
---

## Summary
KiroConnector now installs hooks into ~/.kiro/agents/kiro_default.json (overriding the built-in default agent) instead of a separate sharkbay agent. Removed --agent sharkbay injection from App.tsx since hooks now fire without any flag.

## Files
- src/main/hooks/connectors/kiro.ts
- src/renderer/App.tsx

## Work
- Changed KiroConnector target from ~/.kiro/agents/sharkbay.json to ~/.kiro/agents/kiro_default.json
- Removed name/description for sharkbay agent; set name to "kiro_default" instead
- Added uninstall cleanup: deletes kiro_default.json entirely when only the name field remains (restores built-in)
- Removed --agent sharkbay injection from openAgentProjectTab, SessionsDetailTab, and taskRestoreCommand in App.tsx
- Verified Kiro does NOT read hooks from settings.json (tested with echo hook — not fired)
- Verified Kiro DOES read hooks from agents/kiro_default.json (tested with echo hook — fired)

## Verification
- `npm run typecheck` passes
- `npm test` — 143 tests pass (38 files)
- Manual test: echo hook in kiro_default.json fires on Kiro session start

## Notes
- Kiro CLI does not read hooks from ~/.kiro/settings.json (confirmed by test)
- Kiro CLI reads hooks from agent config files under ~/.kiro/agents/
- Creating kiro_default.json overrides the built-in kiro_default agent — only the hooks field is set, so other behavior (tools, prompt, model) stays default
- Prior task V7M3K8 correctly identified that settings.json doesn't work for hooks
- Prior task K96RNZ's --agent sharkbay workaround caused all tool usage to route through the sharkbay agent profile — this fix eliminates that side effect
- On uninstall, if no non-managed hooks remain, the file is deleted to restore the pure built-in default
