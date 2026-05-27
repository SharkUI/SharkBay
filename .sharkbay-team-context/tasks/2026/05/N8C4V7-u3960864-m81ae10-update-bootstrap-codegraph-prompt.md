---
kind: sharkbay_task
taskId: N8C4V7-u3960864-m81ae10
taskTag: N8C4V7
mode: quick
title: Update bootstrap CodeGraph prompt
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e64b4-2e32-7dd2-b80a-774ed2ef3f9d
branch: main
createdAt: 2026-05-27T02:50:57Z
updatedAt: 2026-05-27T02:55:01Z
completedAt: 2026-05-27T02:55:01Z
---

## Summary
Updated the SharkBay Teamwork bootstrap prompt to the user-provided shorter wording with CodeGraph guidance.

## Files
- .sharkbay/tasks/N8C4V7-u3960864-m81ae10-update-bootstrap-codegraph-prompt.md
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts

## Work
- Searched team context for prior bootstrap prompt work.
- Noted related task `Q8M2L6-u3960864-m81ae10`, which introduced first-message bootstrap prompts.
- Located `TEAMWORK_BOOTSTRAP_PROMPT` and its test references with CodeGraph.
- Replaced the bootstrap prompt with the user-provided shorter wording and added an exact test assertion for the full prompt.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/teamwork-harness.test.ts`
- `npm run typecheck`
- `git diff --check`
- Reviewed the final `TEAMWORK_BOOTSTRAP_PROMPT` source text with `sed`.

## Notes
- User asked to replace the bootstrap prompt with the provided concise text.
- No commit was produced.
