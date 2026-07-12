---
kind: sharkbay_task
taskId: R4K8M2-u3960864-m81ae10
taskTag: R4K8M2
mode: task
title: Filter sub-agent sessions from Sessions tab
status: completed
completedAt: 2026-06-06T13:48:59Z
commits:
  - 176040ac
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 8a01b2be-173c-4a30-8286-1c736480be38
branch: main
createdAt: 2026-06-06T13:47:34Z
updatedAt: 2026-06-06T13:48:59Z
---

## Summary
Filter out Kiro sub-agent sessions from the Sessions tab display. Sub-agents (spawned by the `subagent` tool) show as separate top-level sessions with repetitive titles and no model info, cluttering the list.

## Files
- src/main/hooks/sessions.ts
- tests/hook-sessions.test.ts

## Work
- Diagnosed: Veridia's Sessions tab shows 7 sessions, but 6 are sub-agent sessions spawned by a single parent. They have `session_created_reason: "subagent"` in their `~/.kiro/sessions/cli/<id>.json` file.
- Fix: in `parseHookSessions`, skip Kiro sessions where the session file has both `session_created_reason === "subagent"` AND a `parent_session_id` string.
- Key distinction: `--agent` flag sessions also have `session_created_reason: "subagent"` but lack `parent_session_id`. Only true spawned sub-agents have both.

## Verification
- `npx vitest run` — 160 tests pass across 40 files, including 2 new sub-agent filtering tests.

## Notes
- Sub-agent detection relies on reading `~/.kiro/sessions/cli/<id>.json` (same file already read for model backfill).
- Only Kiro sub-agents are affected; other agents don't currently produce sub-agent sessions via hooks.
