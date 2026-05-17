---
kind: sharkbay_task
taskId: K3F8N1-u3960864-m81ae10
taskTag: K3F8N1
mode: task
title: Add task-first reminder to agent entry files
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
createdAt: 2026-05-17T13:23:08Z
updatedAt: 2026-05-17T13:25:30Z
completedAt: 2026-05-17T13:25:30Z
---

## Summary

Added a prominent "⚠️ Before editing any project file, create a task record" reminder to all agent entry files and the code that generates them, replacing the generic "Before doing anything, you must read" wording.

## Files

- .kiro/steering/sharkbay-protocol.md
- AGENTS.md
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts

## Work

- Updated static `.kiro/steering/sharkbay-protocol.md` with ⚠️ task-first reminder.
- Updated static `AGENTS.md` with the same reminder.
- Updated `generateAdapterMd()` in `teamwork-harness.ts` — this generates AGENTS.md, CLAUDE.md, GEMINI.md, QWEN.md, and .kiro/steering/sharkbay-protocol.md for other projects.
- Updated test assertion in `teamwork-harness.test.ts` to match new wording.
- Verified no other entry points exist (CLAUDE.md/GEMINI.md/QWEN.md are only generated for other projects).

## Verification

- `npm run typecheck` — passed.
- `vitest run tests/teamwork-harness.test.ts` — 10 tests passed.

## Notes

- The old wording ("Before doing anything in this worktree, you must read") was too generic and didn't explicitly call out the task-creation requirement. The new wording puts the actionable rule front and center before the protocol reference.
