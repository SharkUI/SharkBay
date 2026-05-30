---
kind: sharkbay_task
taskId: N4R8C6-u3960864-m81ae10
taskTag: N4R8C6
mode: quick
title: Show Claude model version
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e7681-b658-71a2-a8ae-a5eb20ee0b39
branch: main
createdAt: 2026-05-30T02:35:09Z
updatedAt: 2026-05-30T02:37:52Z
completedAt: 2026-05-30T02:35:54Z
commits:
  - 8c851c1a
---

## Summary
Claude session model labels now keep version information, so the current hooks log model displays as `Opus 4.6` instead of only `Opus`.

## Files
- .sharkbay/tasks/N4R8C6-u3960864-m81ae10-show-claude-model-version.md
- src/renderer/workflow.ts
- tests/renderer-workflow.test.ts

## Work
- Parsed `.sharkbay/logs/hooks.log` and found Claude's non-empty model value is `us.anthropic.claude-opus-4-6-v1`.
- Confirmed the Sessions panel formatting currently collapses that value to `Opus`.
- Updated renderer model formatting to extract Claude family and version from both current and older Claude model naming patterns.
- Added coverage for `us.anthropic.claude-opus-4-6-v1` and `claude-3-5-sonnet-20241022`.

## Verification
- `npm test -- tests/renderer-workflow.test.ts` passed after fixing the version extraction order.
- `npm run typecheck` passed.
- `codegraph affected src/renderer/workflow.ts tests/renderer-workflow.test.ts` reported `tests/renderer-workflow.test.ts`.
- `git diff --check -- src/renderer/workflow.ts tests/renderer-workflow.test.ts` passed.

## Notes
- Related prior task: H5M9Q2-u3960864-m81ae10 fixed Codex model label truncation.
