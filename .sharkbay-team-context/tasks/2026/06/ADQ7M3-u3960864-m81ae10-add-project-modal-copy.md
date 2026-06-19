---
kind: sharkbay_task
taskId: ADQ7M3-u3960864-m81ae10
taskTag: ADQ7M3
mode: quick
title: Tidy Add Project modal copy and actions
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude (claude-opus-4.8)
sessionId: cc0ae2e7-3e87-40e2-86bc-e4955b6960ae
branch: main
createdAt: 2026-06-19T14:15:04Z
updatedAt: 2026-06-19T14:19:38Z
completedAt: 2026-06-19T14:19:38Z
commits:
  - 27254aae
---

## Summary
Trim the Add Project modal (part of the in-progress Clone-Remote feature):
drop the header subtitle, merge the two Remote Repo notes into one line below
the URL input, and remove the Cancel button.

## Files
- src/renderer/App.tsx

## Work
- Remove modal subtitle "Choose an existing local directory or clone a remote
  repository first."
- Merge "Clone into a parent folder, then add the cloned project." and "You
  will choose the parent folder before cloning." into a single note placed
  below the repo URL input.
- Remove the modal-actions Cancel button.

## Verification
- `npm run typecheck` — pass. `closeAddProjectModal` still used by the backdrop
  and the header close (×) button, so removing Cancel left no orphan.

## Notes
- These edits touch the unrelated Clone-Remote feature still uncommitted in the
  working tree (owned by separate work); only the Add Project modal copy is
  changed here, not the clone logic.
