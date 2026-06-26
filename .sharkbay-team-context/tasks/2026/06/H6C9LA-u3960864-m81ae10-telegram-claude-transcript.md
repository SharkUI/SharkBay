---
kind: sharkbay_task
taskId: H6C9LA-u3960864-m81ae10
taskTag: H6C9LA
mode: task
title: Fix Claude Telegram transcript answer and submit delay
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: a9cbaae7-c59c-462f-952c-761456af077d
branch: main
createdAt: 2026-06-26T10:38:47Z
updatedAt: 2026-06-26T11:30:09Z
completedAt: 2026-06-26T11:30:09Z
commits:
  - a112d4b7
  - 1d682adb
  - 61b0b7c8
---

## Summary
Fix Claude Telegram integration: extractClaudeAnswer strictly uses stop_reason:"end_turn" (no fallback to intermediate text), finalizeChat polls up to 3s for transcript flush, and buildAgentSubmitSequence delays \r for Claude TUI.

## Files
- src/main/telegram/transcript.ts
- src/main/telegram/service.ts
- electron/ipc.ts
- tests/telegram-transcript.test.ts
- tests/telegram-service.test.ts

## Work
- Took over from Codex GPT-5 (session 019f036c, commit a112d4b7).
- Root cause of "unclean result": extractClaudeAnswer had a lastText fallback that returned intermediate tool narration when end_turn hadn't flushed to jsonl yet. This made the result non-null (skipping retry) but incomplete.
- Fix: extractClaudeAnswer returns "" when no end_turn exists → extractAnswer returns null → finalizeChat polls up to 6×500ms for the end_turn entry to appear.
- buildAgentSubmitSequence delays \r for Claude (TUI paste-mode fix, same as Codex).
- For supported agents, never fall back to raw PTY.
- findClaudeTranscriptFile locates ~/.claude/projects/**/<sessionId>.jsonl.

## Verification
- `npm test -- tests/telegram-*.test.ts`: 87 tests / 9 files passed.
- `npm run typecheck`: passed.
- Manual Telegram test: final answer now displays clean and complete.

## Notes
- Continues Codex's H6C9LA work (commit a112d4b7).
- Related tasks: K9R2WX, C8D4XM, T8M4QK.
- The 3s polling window covers Claude Code's typical transcript flush delay after stop hook.
