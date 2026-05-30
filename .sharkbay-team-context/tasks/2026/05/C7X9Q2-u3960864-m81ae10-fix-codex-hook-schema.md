---
kind: sharkbay_task
taskId: C7X9Q2-u3960864-m81ae10
taskTag: C7X9Q2
mode: task
title: Fix Codex hook schema
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e7661-518a-7881-9029-87c0aca84367
branch: main
createdAt: 2026-05-30T01:01:47Z
updatedAt: 2026-05-30T01:03:48Z
completedAt: 2026-05-30T01:03:48Z
---

## Summary
Fixed Codex hook installation so SharkBay writes Codex-supported inline TOML hook matcher groups. Added regression coverage to keep old single-command table output from returning.

## Files
- src/main/hooks/connectors/claude-family.ts
- tests/hooks-connectors.test.ts

## Work
- Found related team-context tasks H7K9P2-u3960864-m81ae10, L5R8Q3-u3960864-m81ae10, and K2W8R4-u3960864-m81ae10.
- Started from CodeGraph results for `CodexConnector` and `HOOK_EVENT_SPECS`.
- Changed Codex hook install output from single command tables to inline TOML matcher-group arrays with command handler sub-tables.
- Added regression coverage that replaces the old managed section and verifies the new Codex schema.

## Verification
- `codegraph affected src/main/hooks/connectors/claude-family.ts tests/hooks-connectors.test.ts` reports `tests/hooks-connectors.test.ts`.
- `npm test -- tests/hooks-connectors.test.ts tests/codewhale-hooks.test.ts` passes: 2 files, 10 tests.
- `npm run typecheck` passes.
- `npm test` passes: 38 files, 142 tests.

## Notes
- Current Codex config has SharkBay managed hook entries, but the installed TOML shape uses single `[hooks.event] command = ...` tables instead of Codex matcher-group arrays.
- No commits were produced for this task.
