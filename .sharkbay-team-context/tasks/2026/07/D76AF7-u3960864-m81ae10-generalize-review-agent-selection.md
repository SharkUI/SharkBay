---
kind: sharkbay_task
taskId: D76AF7-u3960864-m81ae10
taskTag: D76AF7
mode: task
title: Generalize Review agent selection
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f5a41-2f28-75b2-8f70-3a2a31cbf82d
branch: codex/agent-review-orchestration
createdAt: 2026-07-14T02:42:40Z
updatedAt: 2026-07-14T03:06:04Z
completedAt: 2026-07-14T03:06:04Z
---

## Summary

Agent-initiated Review now accepts any installed supported agent as the parent or reviewer. Omitting the reviewer defaults to the parent agent without changing hooks, MCP, agent configuration, or existing UI selection behavior.

## Files

- `.sharkbay/tasks/D76AF7-u3960864-m81ae10-generalize-review-agent-selection.md`
- `.sharkbay/harness/protocol.md`
- `.sharkbay/specs/agent-review-orchestration/design.md`
- `src/shared/types.ts`
- `src/renderer/types.ts`
- `src/main/harness.ts`
- `src/main/review-runs.ts`
- `src/main/review-control-server.ts`
- `electron/ipc.ts`
- `tests/harness.test.ts`
- `tests/review-runs.test.ts`
- `tests/review-control-server.test.ts`

## Work

- Reused the completed Review orchestration from task `9NOEQ2-u3960864-m81ae10` rather than creating a parallel control path.
- Fixed scope: optional reviewer selection defaults to the authenticated parent agent; explicit selection accepts any installed supported AgentCli; parent is no longer Codex-only.
- Preserve the no-intrusion boundary: no hooks, MCP, or agent configuration changes. Recover missing Terminal identity from the caller's process ancestry so vendor shell tools do not require new bootstrap credentials.
- Implemented the generalized input contract, parent-agent fallback, installed-agent validation, control-client ancestry recovery, protocol text, design follow-up, and focused regression coverage.

## Verification

- Pending focused tests for cross-agent selection, same-agent defaulting, and ancestor Terminal identity recovery.
- Pending typecheck, full tests, production build, diff check, and hooks-boundary check.
- `npx vitest run tests/review-runs.test.ts tests/review-control-server.test.ts tests/harness.test.ts` (30 tests passed).
- `npm run typecheck` passed for renderer and Node TypeScript configurations.
- `npm test` passed (60 files, 331 tests).
- `npm run build` passed.
- `git diff --check` passed; `git diff --name-only -- src/main/hooks` returned no changes.
- Searched the implementation, tests, harness, and specs for the removed vendor/parent restrictions; no stale restriction text remains.

## Notes

- Parent implementation task and commit: `9NOEQ2-u3960864-m81ae10`, `ae73711c`.
- No commit has been created.
