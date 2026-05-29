---
kind: sharkbay_task
taskId: H7K9P2-u3960864-m81ae10
taskTag: H7K9P2
mode: task
title: Hook-based agent status system
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: d21541d6-ff51-47d0-8815-424161e58910
branch: main
createdAt: 2026-05-29T03:53:34Z
updatedAt: 2026-05-29T04:30:36Z
completedAt: 2026-05-29T04:30:36Z
---

## Summary

Plan for hook-based agent status system to replace unreliable terminal output parsing with precise agent lifecycle events via hook integration.

## Spec

- .sharkbay/specs/hook-based-agent-status/requirements.md
- .sharkbay/specs/hook-based-agent-status/design.md
- .sharkbay/specs/hook-based-agent-status/tasks.md

## Files

- .sharkbay/specs/hook-based-agent-status/requirements.md
- .sharkbay/specs/hook-based-agent-status/design.md
- .sharkbay/specs/hook-based-agent-status/tasks.md
- .sharkbay/specs/hook-based-agent-status/review.md
- src/main/hooks/types.ts
- src/main/hooks/bridge.ts
- src/main/hooks/state-manager.ts
- src/main/hooks/cli/sharkbay-hook.ts
- src/main/hooks/connectors/claude-family.ts
- src/main/hooks/connectors/gemini.ts
- src/main/hooks/connectors/kiro.ts
- src/shared/ipc-channels.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/renderer/workflow.ts
- src/styles/app.css
- electron/ipc.ts
- electron/preload.mts
- tests/ipc-channels.test.ts

## Work

- Researched Open Island (open-vibe-island) hook architecture
- Analyzed hook support across 7 agents (Claude Code, Codex, Gemini CLI, Kiro CLI, DeepSeek, Qwen, OpenCode)
- Confirmed hook mechanism is non-invasive, fail-open, and compatible with --dangerously-skip-permissions
- Designed Connector abstraction for extensibility
- Defined three-state UI (working/idle/attention) with per-agent opt-in
- Reviewed spec by DeepSeek TUI: found 12 issues (1 blocking), identified testing gaps, approved with condition
- Resolved all review issues in spec updates
- Implemented core modules: types, HookBridge, CLI, connectors (Claude/Codex/Qwen/DeepSeek/Gemini/Kiro), StateManager
- Updated UI: three-state pill (green/yellow/red), terminal tab indicator, dock badge (attention-only)
- Added "Enable status hooks" checkbox in Agent CLI settings
- Wired up full integration: IPC channel, preload, HookBridge start on app launch, StateManager→agentStatus relay

## Verification

- `npm run typecheck` passes (renderer + node configs)
- `npm test` passes (36 files, 135 tests, 0 failures)
- No regressions in existing functionality
- OpenCode connector deferred to follow-up (uses terminal output fallback)

## Notes

- OpenCode requires separate JS plugin adapter (not shell hook) — deferred to v2
- Claude/Codex/Qwen/DeepSeek share same hook protocol
- Gemini and Kiro need thin event-name mapping layers
- PreToolUse hook returns immediately (exit 0) to avoid blocking agent
- Fallback to terminal output detection when hooks not enabled
- To test: run `npm run dev`, open Settings → Agent CLI, enable hooks for Claude, then run Claude Code in a project terminal — pill should turn green and subtitle should show tool names
