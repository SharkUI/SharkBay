---
kind: sharkbay_task
taskId: R4W7X2-u3960864-m81ae10
taskTag: R4W7X2
mode: quick
title: Increase prompt history max length to 10K
status: completed
completedAt: 2026-06-09T01:39:37Z
commits:
  - 07046591
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 69b0ee69-1b63-4193-9776-c77f48f5af39
branch: feat/kiro-terminal-approval
createdAt: 2026-06-09T01:38:14Z
updatedAt: 2026-06-09T01:39:37Z
---

## Summary
Increase MAX_PROMPT_LENGTH from 200 to 10000 so prompt history records are not truncated for long inputs.

## Files
- src/main/hooks/prompt-store.ts

## Work
- Change MAX_PROMPT_LENGTH from 200 to 10000.

## Verification
- `npm run typecheck` passed.

## Notes
- 200 chars was too short for typical agent-mode prompts which often include context preambles.
