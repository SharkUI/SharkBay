---
kind: sharkbay_task
taskId: Q7M2NX-u3960864-m81ae10
taskTag: Q7M2NX
mode: quick
title: Complete agent install recipes
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
createdAt: 2026-05-19T12:34:43Z
updatedAt: 2026-05-19T12:38:21Z
completedAt: 2026-05-19T12:38:21Z
---

## Summary
Completed install recipe coverage for all seven detected bundled agent CLIs by adding Kiro, DeepSeek, and Qwen recipes and extending installer tests.

## Files
- .sharkbay/tasks/Q7M2NX-u3960864-m81ae10-complete-agent-install-recipes.md
- src/plugins/bundled/agent-detector.ts
- tests/install-tool.test.ts

## Work
- Related context: `N4P7KQ-u3960864-m81ae10` recently updated agent detector behavior, and `R7W4M2-u3960864-m81ae10` documented OpenCode's install path behavior.
- Started from the current mismatch where detection covers seven agent CLIs but install recipes cover only four.
- Confirmed install sources: Kiro's official CLI install script, Qwen Code's official npm package, and DeepSeek TUI's npm package.
- Added install recipes for Kiro, DeepSeek TUI, and Qwen Code.
- Added tests asserting all detected agent IDs have recipes, Kiro verifies `kiro-cli`, and compatible recipe listing returns all seven tools.

## Verification
- `npm test -- tests/install-tool.test.ts tests/agent-detector.test.ts`
- `npm run typecheck`
- `git diff --check`

## Notes
- `.sharkbay/team-context/` is treated as read-only.
- No commit was produced.
