---
kind: sharkbay_task
taskId: P5N7C3-u3960864-m81ae10
taskTag: P5N7C3
mode: quick
title: Clean remote leftovers
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e723c-7935-77f2-a1fa-1b2e2e5a0166
branch: main
createdAt: 2026-05-29T10:52:49Z
updatedAt: 2026-05-29T11:05:57Z
completedAt: 2026-05-29T10:57:11Z
commits:
  - c26bee99
---

## Summary
Cleaned active renderer/style leftovers from the removed remote machine feature, including stale SSH branches, dead remote constants, and a remote-named modal action class.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Confirmed runtime remote machine support is removed and only local provider is registered.
- Planned cleanup of active renderer SSH branches, dead `isRemote` constants, and remote-named modal action class usage.
- Removed renderer `ssh://` handling, SSH-specific early terminal exit copy, dead `isRemote` constants, and the unused `addProjectUri` helper.
- Replaced the remote-named modal action class with a neutral `modal-actions` style.
- Related context: `R4X7M2-u3960864-m81ae10`.

## Verification
- `rg -n "ssh://|isRemote|remote-machine-form-actions|remoteOnly|SSH connection failed|remote machine|RemoteMachine|SshProvider|portForward" src/renderer src/styles electron src/shared src/core src/providers` — no active source matches.
- `./node_modules/.bin/tsc -p tsconfig.renderer.json --noEmit` — passed.
- `./node_modules/.bin/vitest run` — 36 files, 135 tests passed.

## Notes
- Focus cleanup on active source/UI leftovers, not historical docs that describe future multi-target designs unless they affect runtime behavior.
