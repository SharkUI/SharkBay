---
kind: sharkbay_task
taskId: G7M4T8-u3960864-m81ae10
taskTag: G7M4T8
mode: task
title: Show model for Gemini sessions in detail panel
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: 4bb64d90-ffad-49b7-91d5-726d7323a9c5
branch: main
createdAt: 2026-05-30T04:28:52Z
updatedAt: 2026-05-30T04:30:49Z
completedAt: 2026-05-30T04:30:49Z
commits:
  - 43a0e45
---

## Summary
Gemini sessions showed no model because Gemini hook events carry no `model` field. `parseHookSessions` now backfills the model from the Gemini chat transcript referenced by payload.transcript_path (last model used).

## Files
- src/main/hooks/sessions.ts
- tests/hook-sessions.test.ts

## Work
- Root cause: like Kiro, Gemini hook payloads carry no `model`.
- Source: hook payload `transcript_path` → Gemini chat jsonl; last record with a `model` string is the active model.
- Captured transcript_path per session during log parse (already in logged payload), then read last model for gemini sessions with null model. Added readGeminiModel(); excluded internal transcriptPath from the returned HookSession via destructuring.
- Added test for gemini backfill (last-model wins; no transcriptPath leak).

## Verification
- npm run typecheck: passes (renderer + node).
- vitest tests/hook-sessions.test.ts: 3 pass.
- Real-data check: commontasks transcript -> gemini-3-flash-preview; multi-model transcript -> gemini-3.1-pro-preview (last used).
- NOTE: 9 pre-existing failures in tests/codewhale-hooks.test.ts + tests/agent-session-restore.test.ts (codewhale->deepseek rename) fail WITHOUT this change too (verified via git stash); unrelated to this task.

## Notes
- Builds on V6N2J8 (sessions tab) and H5M9Q2 (label formatting). Complementary: this fixes the data source, not the label. Same pattern as K3P7Q2 (Kiro).
- Only newly logged Gemini events carry transcript_path; pre-existing log lines without it won't backfill until a new event arrives.
