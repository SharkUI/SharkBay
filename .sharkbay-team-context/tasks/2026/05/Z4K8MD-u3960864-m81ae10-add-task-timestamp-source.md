---
kind: sharkbay_task
taskId: Z4K8MD-u3960864-m81ae10
taskTag: Z4K8MD
mode: quick
title: Add task timestamp source
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e5f11-fb10-7381-b078-8ec9d996342b
branch: main
createdAt: 2026-05-25T12:21:56Z
updatedAt: 2026-05-25T12:23:06Z
completedAt: 2026-05-25T12:23:06Z
---

## Summary
Added explicit SharkBay protocol guidance requiring agents to obtain task timestamps from `date -u` instead of estimating them. The generated harness template, current local protocol, and harness install test now carry the same rule.

## Files
- .sharkbay/harness/protocol.md
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts
- .sharkbay/tasks/Z4K8MD-u3960864-m81ae10-add-task-timestamp-source.md

## Work
- Searched team context for protocol, frontmatter, and timestamp-related prior work.
- Relevant prior tasks: B6R2N9-u3960864-m81ae10, T8H4V2-u3960864-m81ae10, S9K4M2-u3960864-m81ae10.
- Confirmed the local protocol is generated from `src/main/teamwork-harness.ts`, so the source template and tests need the same wording.
- Added timestamp-source guidance after the task creation branch rule and before the completion frontmatter example.
- Added test assertions covering the `date -u` command and the no-fabrication rule.

## Verification
- `npm test -- tests/teamwork-harness.test.ts`
- `git diff --check`
- `rg -n "date -u \\+%Y-%m-%dT%H:%M:%SZ|Never estimate" .sharkbay/harness/protocol.md src/main/teamwork-harness.ts tests/teamwork-harness.test.ts .sharkbay/tasks/Z4K8MD-u3960864-m81ae10-add-task-timestamp-source.md`

## Notes
- Keep `.sharkbay/team-context/` read-only.
- No commit produced.
