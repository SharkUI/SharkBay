---
kind: sharkbay_task
taskId: L4V8N3-u3960864-m81ae10
taskTag: L4V8N3
mode: task
title: Debug packaged OpenCode hang
status: completed
completedAt: 2026-05-22T03:45:54Z
commit: 6ba43df58fbefc597c20296eca358d9c1dbd058a
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e4b2b-d196-77b0-ab25-3a51f6f15046
branch: main
createdAt: 2026-05-22T02:16:38Z
updatedAt: 2026-05-22T03:45:54Z
---

## Summary
Fixed a packaged OpenCode startup race where terminal output could arrive before the renderer had registered the corresponding tab, leaving the UI stuck on the launch command even though OpenCode was running.

## Files
- .sharkbay/tasks/L4V8N3-u3960864-m81ae10-debug-packaged-opencode-hang.md
- src/renderer/App.tsx

## Work
- Started from user report that the freshly packed app still fake-freezes when opening OpenCode.
- Related context: `Q24IBU-u3960864-m81ae10`, `H7Q2VB-u3960864-m81ae10`, and `J8P4L6-u3960864-m81ae10`.
- `J8P4L6-u3960864-m81ae10` found stale installed `/Applications/SharkBay.app` artifacts can be mistaken for a fresh package.
- Confirmed the installed `/Applications/SharkBay.app` includes the `H7Q2VB` renderer activity guard and `Q24IBU` `inputFire` path, so the current repro is not just an old installed app.
- New OpenCode logs from 2026-05-22T02:09 and 2026-05-22T02:14 show startup followed by `worker shutting down`, `EIO: i/o error, write exception`, and `Aborted process` within about four seconds.
- Runtime process inspection after the reported freeze showed SharkBay main/renderer/utility processes but no live `opencode` process; renderer was still consuming CPU.
- Captured a live stuck packaged OpenCode at 2026-05-22T02:56: `/Users/shark/.opencode/bin/opencode` was alive under SharkBay's zsh/pty, foreground on `ttys008`, with logs showing the bootstrap prompt completed and the session entered idle.
- The OpenCode terminal UI remained stuck on the launched command text even though the OpenCode backend had processed the prompt, pointing to a terminal output delivery/rendering race rather than a model or process startup failure.
- Sampled live `opencode`, SharkBay main, renderer, and utility processes to `/private/tmp/sharkbay-*-live.sample.txt`; utility process held the expected node-pty descriptors for `ttys008`.
- Added renderer-side pending terminal output buffering keyed by `sessionId`, with replay once the matching terminal tab exists.
- Cleared pending terminal output on pane unmount and terminal exit to avoid stale buffers for windows that do not own a session.

## Verification
- `npm run typecheck` passed.
- `npm test` passed: 36 files, 115 tests.
- `npm run pack` passed and produced `release/mac-arm64/SharkBay.app` at 2026-05-22 11:04 local time.
- Confirmed packaged `app.asar` includes the new pending terminal output path and the prior `inputFire` path.
- `git diff --check` passed.
- Manual live verification of the new packaged app was not run to avoid disturbing the currently open `/Applications/SharkBay.app` session and triggering another OpenCode prompt from the UI.

## Notes
- Treat `.sharkbay/team-context/` as read-only.
