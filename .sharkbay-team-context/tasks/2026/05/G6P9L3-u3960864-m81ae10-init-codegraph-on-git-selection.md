---
kind: sharkbay_task
taskId: G6P9L3-u3960864-m81ae10
taskTag: G6P9L3
mode: quick
title: Init CodeGraph on Git selection
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e675b-d21b-7a62-afcf-78e643d41de6
branch: main
createdAt: 2026-05-27T02:58:57Z
updatedAt: 2026-05-27T03:01:33Z
completedAt: 2026-05-27T03:01:33Z
---

## Summary
Selected local Git projects now initialize CodeGraph immediately when the current status reports uninitialized. Existing stale-index sync behavior remains tied to the Git dirty-count debounce path.

## Files
- .sharkbay/tasks/G6P9L3-u3960864-m81ae10-init-codegraph-on-git-selection.md
- src/renderer/App.tsx
- src/renderer/workflow.ts
- tests/renderer-workflow.test.ts

## Work
- Searched team context and found K3D9P4-u3960864-m81ae10 as the prior CodeGraph sync-trigger change.
- Added a renderer workflow predicate for selected local Git projects whose CodeGraph status is uninitialized.
- Wired the project detail CodeGraph status read to immediately run ensure for that missing-init case while leaving stale Git indexes on the dirty-count debounce path.
- Added renderer workflow regression coverage for local Git, stale status, non-Git, and remote cases.

## Verification
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/renderer-workflow.test.ts`
- `npm run typecheck`
- `git diff --check`
- `git diff --name-only | codegraph affected --stdin --quiet`
- `codegraph sync -q /Users/shark/Projects/SharkBay && codegraph status --json /Users/shark/Projects/SharkBay`

## Notes
- Builds on T9C2G7-u3960864-m81ae10 and K3D9P4-u3960864-m81ae10.
