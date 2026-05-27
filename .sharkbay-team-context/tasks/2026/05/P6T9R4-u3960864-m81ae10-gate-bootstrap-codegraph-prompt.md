---
kind: sharkbay_task
taskId: P6T9R4-u3960864-m81ae10
taskTag: P6T9R4
mode: quick
title: Gate bootstrap CodeGraph prompt
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e64b4-2e32-7dd2-b80a-774ed2ef3f9d
branch: main
createdAt: 2026-05-27T03:40:26Z
updatedAt: 2026-05-27T03:51:30Z
completedAt: 2026-05-27T03:51:30Z
---

## Summary
Gated the Teamwork bootstrap CodeGraph guidance on the CodeGraph extension enabled state.

## Files
- .sharkbay/tasks/P6T9R4-u3960864-m81ae10-gate-bootstrap-codegraph-prompt.md
- src/core/core-service.ts
- src/main/teamwork-harness.ts
- src/main/terminal.ts
- src/renderer/types.ts
- src/shared/types.ts
- tests/teamwork-harness.test.ts

## Work
- Searched team context for prior bootstrap and CodeGraph extension work.
- Noted related tasks `N8C4V7-u3960864-m81ae10`, `Q8M2L6-u3960864-m81ae10`, and `T9C2G7-u3960864-m81ae10`.
- Located the bootstrap launch path and CodeGraph plugin enabled-state lookup with CodeGraph.
- Planned to read CodeGraph enabled state in `SharkBayCoreService.createTerminal` and pass it through terminal creation as an internal bootstrap option.
- Split the bootstrap prompt into base text plus optional CodeGraph guidance, and used the launch result prompt for delayed DeepSeek/OpenCode injection.
- Wired terminal creation to receive the CodeGraph enabled state from `SharkBayCoreService.createTerminal`.
- Added tests for conditional prompt composition and for overriding caller-provided bootstrap state with the plugin host state.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/teamwork-harness.test.ts`
- `npm run typecheck`
- `git diff --check`
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/terminal.test.ts`

## Notes
- User requested reading the CodeGraph plugin enabled state before bootstrap injection.
- Existing unrelated modified renderer files were left untouched.
- No commit was produced.
