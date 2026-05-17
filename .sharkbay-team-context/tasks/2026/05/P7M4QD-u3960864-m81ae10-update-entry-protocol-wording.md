---
kind: sharkbay_task
taskId: P7M4QD-u3960864-m81ae10
taskTag: P7M4QD
mode: quick
title: Update entry protocol wording
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: codex
createdAt: 2026-05-17T05:29:27Z
updatedAt: 2026-05-17T05:31:09Z
completedAt: 2026-05-17T05:31:09Z
---

## Summary
Update generated and current SharkBay entry files so agents must read the harness protocol before any work.

## Files
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts
- AGENTS.md
- CLAUDE.md
- GEMINI.md
- QWEN.md
- .kiro/steering/sharkbay-protocol.md
- docs/agents.md

## Work
- Started from team context task MYQTYZ-u3960864-m81ae10, which established the current multi-CLI entry file set.
- Updated generated adapter wording, current generated entry files, and the agent guide to require reading the protocol before any work.
- Added a harness test assertion for the new required wording.

## Verification
- `npm test -- tests/teamwork-harness.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; refreshed ignored compiled output.
- `rg --no-ignore -n "Before making persistent project changes, read|Before making persistent project changes, read and follow|Before doing anything in this worktree" . --glob '!node_modules' --glob '!dist' --glob '!build'`: only current wording remains in source/current entries; old wording remains only in historical docs/shared/teamwork-design.html.

## Notes
- Existing user changes in README.md and docs/teamwork-protocol-helper.md are intentionally untouched.
