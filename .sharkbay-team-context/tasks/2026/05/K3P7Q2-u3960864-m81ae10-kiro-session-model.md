---
kind: sharkbay_task
taskId: K3P7Q2-u3960864-m81ae10
taskTag: K3P7Q2
mode: task
title: Show model for Kiro sessions in detail panel
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: 4bb64d90-ffad-49b7-91d5-726d7323a9c5
branch: main
createdAt: 2026-05-30T04:10:52Z
updatedAt: 2026-05-30T04:13:29Z
completedAt: 2026-05-30T04:13:29Z
commits:
  - 18ad146
---

## Summary
Kiro sessions showed no model in the Sessions detail panel because Kiro hook events carry no `model` field. `parseHookSessions` now backfills the model from Kiro's local session file.

## Files
- src/main/hooks/sessions.ts
- tests/hook-sessions.test.ts

## Work
- Root cause: Kiro hook payloads only contain hook_event_name/cwd/session_id/prompt/tool_*; no `model`, so session.model stayed null (claude/codex do carry model).
- Source of truth: `~/.kiro/sessions/cli/<sessionId>.json` → session_state.rts_model_state.model_info.model_id (sessionId matches hooks.log session_id).
- Added `readKiroModel(sessionId)`; for kiro sessions with model===null, backfill from that file before returning.
- Added test coverage (backfill present + missing-file null).

## Verification
- npm run typecheck: passes (renderer + node)
- vitest run: 145 tests pass (39 files), incl. new tests/hook-sessions.test.ts
- Manual node check against real ~/.kiro data: resolves "auto" for most sessions, "claude-opus-4.8" for current session.

## Notes
- Builds on prior task V6N2J8 (Add Sessions detail tab from hooks log).
- model_id is frequently "auto" (user hasn't pinned a model); displaying "auto" is still better than blank. formatSessionModelName returns it as-is.
- No commit produced (not requested).
