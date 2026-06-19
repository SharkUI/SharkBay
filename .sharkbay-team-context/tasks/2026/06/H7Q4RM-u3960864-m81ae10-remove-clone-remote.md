---
kind: sharkbay_task
taskId: H7Q4RM-u3960864-m81ae10
taskTag: H7Q4RM
mode: quick
title: Remove clone remote action
status: completed
completedAt: 2026-06-19T13:20:38Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019edffd-3e46-70b2-896b-603fbf66cd02
branch: main
createdAt: 2026-06-19T13:19:04Z
updatedAt: 2026-06-19T13:20:38Z
---

## Summary
Removed the existing-project Clone Remote action from the Git panel. Non-Git projects now only offer local `git init`, avoiding a `git clone ... .` flow that fails after project initialization writes hidden files.

## Files
- .sharkbay/tasks/H7Q4RM-u3960864-m81ae10-remove-clone-remote.md
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Started from user decision that Clone Remote is not appropriate inside an already created project.
- Reviewed related team task W2N8K4-u3960864-m81ae10, which originally added the Git panel clone action.
- Removing only the existing-project clone prompt; keeping the local `git init` action.
- Removing clone-input CSS left unused by this change.

## Verification
- `rg -n "Clone Remote|git clone|git-clone|clone an existing remote|showCloneInput|cloneUrl" src tests` — no matches.
- `npm run typecheck` — passed.

## Notes
- Future Add Project flow should split Local Directory and Remote Repo before project initialization.
