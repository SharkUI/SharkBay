---
kind: sharkbay_task
taskId: Q8M2L6-u3960864-m81ae10
taskTag: Q8M2L6
mode: task
title: Bootstrap agent prompts
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
createdAt: 2026-05-18T08:37:44Z
updatedAt: 2026-05-18T08:51:06Z
completedAt: 2026-05-18T08:51:06Z
commit: eda9e40c22c2afcd822618bd0ae2ee16f8662e04
---

## Summary
Replaced Teamwork agent entry-file repair on launch with first-message bootstrap prompts for supported agent CLIs. Supported agents now receive the protocol pointer through their startup command when Teamwork is installed.

## Files
- .sharkbay/tasks/Q8M2L6-u3960864-m81ae10-bootstrap-agent-prompts.md
- src/main/teamwork-harness.ts
- src/main/terminal.ts
- tests/teamwork-harness.test.ts
- tests/terminal.test.ts
- README.md
- docs/teamwork.md
- docs/development.md
- docs/product.md
- docs/architecture.md

## Work
- Started from prior Teamwork entry repair context and scoped this task to launch-time prompt injection.
- Identified the main-process terminal launch path as the right Teamwork state boundary for bootstrap injection.
- Replaced launch-time entry-file repair with Teamwork bootstrap command preparation for Codex, Claude, Gemini, Qwen, Kiro, and OpenCode.
- Updated tests and docs to state that supported agent launches receive first-message bootstrap prompts instead of generated entry files.

## Verification
- `npm run typecheck`
- `npm run test -- tests/teamwork-harness.test.ts tests/terminal.test.ts`
- `npm test`
- `npm run build`
- `npm run pack`

## Notes
- Related prior task: Y3N8P4-u3960864-m81ae10.
- Commit: eda9e40c22c2afcd822618bd0ae2ee16f8662e04.
