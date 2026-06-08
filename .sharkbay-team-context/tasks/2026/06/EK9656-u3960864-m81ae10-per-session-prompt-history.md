---
kind: sharkbay_task
taskId: EK9656-u3960864-m81ae10
taskTag: EK9656
mode: task
title: Per-session prompt history with persistence
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: a0d05388-6acc-4ebf-9fc4-b92cbbdebc90
branch: feat/island-overlay
createdAt: 2026-06-08T04:04:33Z
updatedAt: 2026-06-08T15:47:23Z
completedAt: 2026-06-08T15:47:23Z
commits:
  - b626c3c1
  - 3b9a8768
  - 22d66361
---

## Summary

Prompt input history is now per-session for agents (keyed by hook session id, stable across restore) and per-project for shell tabs. Both are persisted to disk and survive app restarts.

## Files

- src/main/hooks/prompt-store.ts
- src/shared/ipc-channels.ts
- electron/ipc.ts
- electron/preload.mts
- electron/main.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- tests/prompt-store.test.ts
- tests/ipc-channels.test.ts

## Work

- Rewrote SessionPromptStore to store full history lists per key with getHistory(). Migrates old format on load.
- Added flushSync() method, called on before-quit to prevent data loss from debounced writes.
- Agent sessions use agentHookSessionId (from hookStateBySessionId) as history key — stable across session restore.
- Shell sessions use `${projectId}:shell` — all shell tabs in a project share and persist history.
- Added recordPromptHistoryEntry IPC for direct key-based persistence (used by shell).
- Agent sessions use existing recordPrompt IPC which maps terminalSessionId → agentSessionId on backend.
- Fixed pendingPromptsByTerminal to buffer all prompts (was overwriting with only the last one).
- Added in-memory migration when agentHookSessionId becomes available after initial prompts.

## Verification

- `vitest run tests/prompt-store.test.ts` — 6 tests pass
- `vitest run tests/ipc-channels.test.ts` — 1 test passes
- `tsc -p tsconfig.node.json --noEmit` — no errors
- `vite build` — production build succeeds

## Notes

- agentHookSessionId may be null initially (before first hook event arrives). Prompts submitted in this window are recorded in memory under terminal sessionId and migrated when the hook id resolves.
- Shell history is shared across all shell tabs in the same project. Agent history is strictly per-session.
- projectId prop in PromptInputBar is now used only for shell historyKey derivation.
