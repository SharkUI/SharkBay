---
kind: sharkbay_task
taskId: J8P4L6-u3960864-m81ae10
taskTag: J8P4L6
mode: task
title: Investigate packaged harness update prompt
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e4aae-1051-7390-9545-b07a6ae7c9c7
branch: main
createdAt: 2026-05-22T02:11:37Z
updatedAt: 2026-05-22T02:13:24Z
completedAt: 2026-05-22T02:13:24Z
---

## Summary
Confirmed the missing Update Harness button in the packaged app was caused by running stale packaged artifacts. The installed `/Applications/SharkBay.app` and existing release zip/dmg predate the harness update commit; a fresh `npm run pack` app contains the expected renderer text and IPC channel.

## Files
- .sharkbay/tasks/J8P4L6-u3960864-m81ae10-investigate-packaged-harness-update.md
- release/

## Work
- Searched team context for packaged-app regressions and found related task H7Q2VB-u3960864-m81ae10.
- Confirmed `/Applications/SharkBay.app` does not contain `Harness Update` or `teamwork:updateHarness`, while current build output contains the new Teamwork IPC.
- Found the installed app timestamp predates the harness update commit, matching H7Q2VB's stale packaged-app verification concern.
- Ran a fresh `npm run pack`, producing `release/mac-arm64/SharkBay.app`.
- Verified the fresh app's `app.asar` contains `Harness Update`, `teamwork:updateHarness`, `Teamwork harness updated`, and `harnessUpdate`.

## Verification
- `strings -a /Applications/SharkBay.app/Contents/Resources/app.asar | rg -n "Harness Update|teamwork:updateHarness|Teamwork harness updated|harnessUpdate"` returned no matches.
- `stat -f ...` showed `/Applications/SharkBay.app` at 2026-05-22 09:38 +0800 and release zip/dmg at 2026-05-21 23:30 +0800.
- `npm run pack`
- `strings -a release/mac-arm64/SharkBay.app/Contents/Resources/app.asar | rg -n "Harness Update|teamwork:updateHarness|Teamwork harness updated|harnessUpdate"` returned matches.

## Notes
- Keep .sharkbay/team-context/ read-only.
- Git worktree has no tracked dirty files after the fresh package build.
- No commit was produced; investigation only.
