---
kind: sharkbay_task
taskId: K2W8R4-u3960864-m81ae10
taskTag: K2W8R4
mode: task
title: Fix hook state working flicker and idle_prompt attention
status: completed
completedAt: 2026-05-29T15:39:06Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: c7bf41f7-691b-48ff-a3cf-4567c6449adc
branch: main
createdAt: 2026-05-29T15:38:10Z
updatedAt: 2026-05-29T15:41:26Z
commits:
  - dd1dfd51
---

## Summary
Fix two bugs: (1) tool_end should not break working state mid-turn, (2) idle_prompt notification should map to idle not attention.

## Files
- src/main/hooks/state-manager.ts
- src/main/hooks/connectors/claude-family.ts
- tests/codewhale-hooks.test.ts

## Work
- tool_end → working (stay working within a turn)
- idle_prompt Notification → turn_end (idle) instead of attention

## Verification
- All 141 tests pass (vitest run)

## Notes
- Related to commit 6c1e1dc8 (hook-based agent status system)
