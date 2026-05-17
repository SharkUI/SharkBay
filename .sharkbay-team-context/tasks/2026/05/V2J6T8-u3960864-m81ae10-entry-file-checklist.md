---
kind: sharkbay_task
taskId: V2J6T8-u3960864-m81ae10
taskTag: V2J6T8
mode: quick
title: Replace single-line reminder with mini-checklist in entry files
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
createdAt: 2026-05-17T13:30:46Z
updatedAt: 2026-05-17T13:31:50Z
completedAt: 2026-05-17T13:31:50Z
commit: e89862e1
---

## Summary

Replaced the single-line "create task first" reminder with a 4-step workflow checklist in all agent entry files and the generator code.

## Files

- .kiro/steering/sharkbay-protocol.md
- AGENTS.md
- CLAUDE.md
- GEMINI.md
- QWEN.md
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts

## Work

- Updated `generateAdapterMd()` with 4-step checklist covering full task lifecycle.
- Updated all 5 static entry files in this repo to match.
- Updated test assertion.

## Verification

- `npm run typecheck` — passed.
- `vitest run tests/teamwork-harness.test.ts` — 10 tests passed.

## Notes

- The checklist covers: create task before editing, update during work, write commit hash after commit, mark completed at end.
- Previous single-line reminder only covered step 1, causing agents to forget post-commit steps.
