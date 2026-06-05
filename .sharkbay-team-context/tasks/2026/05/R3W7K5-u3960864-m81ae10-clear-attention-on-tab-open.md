---
kind: sharkbay_task
taskId: R3W7K5-u3960864-m81ae10
taskTag: R3W7K5
mode: quick
title: Clear attention tag when causing terminal tab is opened
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: d821a344-abc5-45bc-8f7b-47d398901e9e
branch: main
createdAt: 2026-05-22T06:52:00Z
updatedAt: 2026-05-22T06:59:00Z
completedAt: 2026-05-22T06:59:00Z
commit: b615a599
---

## Summary
Clear the project card "attention" pill when the user selects a project whose active terminal tab is the one in "done" state.

## Files
- src/renderer/App.tsx

## Work
- Identified that `clearTerminalDoneState` is only called on tab button click, not when the project becomes active and the active tab is already "done".
- Added `clearTerminalDoneState` call in the candidate-change `useEffect`: when the project becomes active and the active tab is a terminal tab with "done" state, it clears it.
- Related to team task K9P2V4 (keep working tag on project switch).

## Verification
- `npm run typecheck` — passes
- `npm test` — 119 tests pass

## Notes
- The fix adds a call to `clearTerminalDoneState` in the candidate-change effect when the active tab has "done" state.
