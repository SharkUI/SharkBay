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
updatedAt: 2026-06-08T04:12:21Z
completedAt: 2026-06-08T04:12:21Z
---

## Summary

Prompt history is now per-session (keyed by sessionId). Agent sessions persist full history to disk and reload it on restore; shell sessions use in-memory per-tab history.

## Files

- src/main/hooks/prompt-store.ts
- src/shared/ipc-channels.ts
- electron/ipc.ts
- electron/preload.mts
- src/renderer/App.tsx
- src/renderer/types.ts
- tests/prompt-store.test.ts
- tests/ipc-channels.test.ts

## Work

- Rewrote SessionPromptStore to store ordered history lists (string[]) per session instead of a single last-prompt string. Added getHistory() method. Maintained backwards-compatible get() for island tabs.
- Added migration from old format ({ text, updatedAt }) to new format ({ history, updatedAt }) on load.
- Added `loadSessionPromptHistory` IPC channel (ipcMain.handle → promptStore.getHistory).
- Exposed `loadPromptHistory` in preload.mts and renderer types.
- Changed PromptInputBar historyKey from `${projectId}:agent|shell` to `sessionId`. Each session now has its own history.
- Agent sessions load persisted history from backend on mount via async IPC.

## Verification

- `vitest run tests/prompt-store.test.ts` — 6 tests pass (record/get/getHistory, persistence, old format migration, truncation, whitespace normalization).
- `vitest run tests/ipc-channels.test.ts` — 1 test passes.
- `vite build` — production build succeeds.
- `tsc --noEmit` has pre-existing TS5070 error (resolveJsonModule + classic moduleResolution) unrelated to this change.

## Notes

- `projectId` prop in PromptInputBar is no longer used internally but left in place to avoid touching the caller.
- Shell terminal sessions get per-tab history (in-memory, lost on tab close). Agent sessions get persistent history (survives app restart and session restore).
