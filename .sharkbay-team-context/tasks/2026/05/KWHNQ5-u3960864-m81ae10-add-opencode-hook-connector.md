---
kind: sharkbay_task
taskId: KWHNQ5-u3960864-m81ae10
taskTag: KWHNQ5
mode: task
title: Add OpenCode hook connector
status: completed
completedAt: 2026-05-30T07:29:59Z
commits:
  - 3c5b3663
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 2c1435a5-d624-4c18-af12-1e610d1192e4
branch: main
createdAt: 2026-05-30T06:51:54Z
updatedAt: 2026-05-30T07:29:59Z
---

## Summary
Implement OpenCode hook connector as a JS plugin that forwards lifecycle events to HookBridge via Unix socket.

## Files
- src/main/hooks/connectors/opencode.ts
- electron/ipc.ts
- tests/opencode-hooks.test.ts

## Work
- Researched OpenCode plugin API: `@opencode-ai/plugin` v1.15.6, plugin receives `client` with SSE event subscription, `event` hook receives all events
- Key events to map: `session.created`→session_start, `session.status.busy`→prompt, `session.idle`→turn_end, `message.part.updated.tool.running`→tool_start, `message.part.updated.tool.completed/error`→tool_end, `permission.updated`→attention
- Plugin approach: generate a JS plugin file at `~/.config/opencode/plugins/sharkbay/index.js` that connects to HookBridge socket and forwards normalized events
- OpenCode plugins registered in `opencode.jsonc` via `plugin` array (`"./plugins/sharkbay"`)
- Connector uses `event` hook in generated plugin to map SDK SSE events to HookBridge wire format
- Plugin reads socket path from the same `hook-socket-path` file used by sharkbay-hook CLI
- Registered connector in `electron/ipc.ts` alongside existing connectors
- Added JSONC comment stripping for reading `opencode.jsonc` config
- Wrote 11 tests covering normalize (all event types + edge cases) and install/uninstall round-trip

## Verification
- `npx vitest run tests/opencode-hooks.test.ts` — 11 tests pass
- `npx vitest run` — all 157 tests pass (40 files)
- `npx tsc -p tsconfig.node.json --noEmit` — clean
- Live tested: plugin loads in OpenCode, events flow through HookBridge, sessions appear in UI with correct icon and model

## Notes
- OpenCode uses a fundamentally different hook mechanism from other agents: it's a JS plugin loaded in-process, not a CLI command called per-event
- The plugin uses the SDK `event` hook (receives all SSE events from the OpenCode server), not stdin JSON
- Design spec originally marked this as "延后实现" (deferred) due to maintenance cost of tracking plugin API changes
- Plugin must forward events to the HookBridge Unix socket in the same wire format as sharkbay-hook CLI
- The `install()` method derives the socketPathFile from `hookCliPath` (sibling of `bin/` in appDataPath)
- JSONC parsing handles `//` and `/* */` comments in opencode.jsonc
