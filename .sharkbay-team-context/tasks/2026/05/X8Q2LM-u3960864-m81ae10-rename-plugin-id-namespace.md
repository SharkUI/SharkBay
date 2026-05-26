---
kind: sharkbay_task
taskId: X8Q2LM-u3960864-m81ae10
taskTag: X8Q2LM
mode: quick
title: Rename plugin ID namespace
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e633b-10c4-7561-a52f-e660da21a851
branch: main
createdAt: 2026-05-26T11:40:25Z
updatedAt: 2026-05-26T11:41:06Z
completedAt: 2026-05-26T11:41:06Z
---

## Summary
Renamed built-in plugin IDs from the old `com.sharkbay.*` namespace to the domain-correct `xyz.sharkbay.*` namespace without adding a migration.

## Files
- .sharkbay/tasks/X8Q2LM-u3960864-m81ae10-rename-plugin-id-namespace.md
- src/plugins/bundled/core-detectors.ts
- src/plugins/bundled/agent-detector.ts
- src/plugins/bundled/node-detector.ts
- src/plugins/bundled/python-detector.ts
- src/plugins/bundled/go-detector.ts
- src/plugins/bundled/rust-detector.ts
- src/plugins/bundled/java-detector.ts
- src/renderer/App.tsx
- tests/diagnostics.test.ts
- tests/plugin-host.test.ts
- tests/plugin-manifest.test.ts
- docs/execution-target-profiles.md

## Work
- Searched team context and project files for existing `com.sharkbay.*` and `xyz.sharkbay.*` references.
- Updated all bundled plugin IDs, the Settings core-plugin guard, tests, and architecture examples to use `xyz.sharkbay.*`.
- Kept the change migration-free per user direction.

## Verification
- `rg -n "com\\.sharkbay|xyz\\.sharkbay" src tests docs electron package.json .sharkbay/tasks/X8Q2LM-u3960864-m81ae10-rename-plugin-id-namespace.md`
- `npm test -- tests/plugin-host.test.ts tests/plugin-manifest.test.ts tests/diagnostics.test.ts`
- `npm run typecheck`
- `git diff --check`

## Notes
- User explicitly requested no migration because the current user base is small.
- No commit was produced.
