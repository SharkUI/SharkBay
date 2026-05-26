---
kind: sharkbay_task
taskId: P4N9X2-u3960864-m81ae10
taskTag: P4N9X2
mode: quick
title: Fix packaged CodeGraph PATH
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e633b-10c4-7561-a52f-e660da21a851
branch: main
createdAt: 2026-05-26T14:00:47Z
updatedAt: 2026-05-26T14:24:58Z
completedAt: 2026-05-26T14:02:45Z
commits:
  - a1dfe073
---

## Summary
Fixed packaged app CodeGraph CLI execution when CodeGraph is installed through nvm by running the resolved CLI with its directory prepended to PATH.

## Files
- .sharkbay/tasks/P4N9X2-u3960864-m81ae10-fix-codegraph-packaged-path.md
- src/core/codegraph-manager.ts
- tests/codegraph-manager.test.ts

## Work
- Confirmed the local `codegraph` executable is an nvm npm shim using `#!/usr/bin/env node`.
- Found CodeGraph execution used `execFile` without adding the resolved CLI directory to PATH.
- Updated CodeGraph command execution to prepend the resolved CLI directory to PATH and surface stderr as the primary error message.
- Added regression coverage for npm shim PATH construction.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/codegraph-manager.test.ts`
- `npm run typecheck`
- `git diff --check`
- Reproduced `env: node: No such file or directory` with a sparse PATH and confirmed the same command works when the nvm bin directory is prepended.
- `npm run pack` produced `release/mac-arm64/SharkBay.app`.
- `codegraph sync -q /Users/shark/Projects/SharkBay && codegraph status --json /Users/shark/Projects/SharkBay` reported `pendingChanges` all zero.

## Notes
- Related prior packaged PATH work appears in N4P7KQ-u3960864-m81ae10 and T2K8M5-u3960864-m81ae10.
- Commit `a1dfe073` contains the packaged CodeGraph PATH fix.
