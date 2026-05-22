---
kind: sharkbay_task
taskId: H7Q2VB-u3960864-m81ae10
taskTag: H7Q2VB
mode: task
title: Investigate packaged OpenCode freeze
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e4b2b-d196-77b0-ab25-3a51f6f15046
branch: main
createdAt: 2026-05-22T01:32:16Z
updatedAt: 2026-05-22T01:46:08Z
completedAt: 2026-05-22T01:46:08Z
---

## Summary
Confirmed the packaged app already included the Q24IBU input IPC change, so the remaining freeze evidence points at SharkBay's renderer/output handling rather than a missing packaged fix. Reduced terminal activity React state churn so high-volume TUI output no longer re-renders the workspace on every output chunk.

## Files
- .sharkbay/tasks/H7Q2VB-u3960864-m81ae10-investigate-packaged-opencode-freeze.md
- src/renderer/App.tsx

## Work
- Started from user observation that OpenCode previously opened normally, then froze again after packing a new app.
- Related context: `Q24IBU-u3960864-m81ae10` changed terminal input IPC to fire-and-forget but did not verify the packaged app flow.
- Confirmed current `dist-electron` and the ZIP-packaged `app.asar` both include the `inputFire` preload API and `ipcMain.on(channels.terminalInput)` listener, so the package did not simply omit the Q24IBU code change.
- Found the local `release/mac-arm64` directory has no expanded `.app`; the current release artifacts are ZIP/DMG from 2026-05-21 23:30.
- Confirmed `~/.opencode/bin/opencode` is an arm64 Mach-O executable rather than a shell wrapper.
- Runtime evidence showed `/Applications/SharkBay.app` still running from the packaged app, with no live OpenCode process and the renderer using sustained CPU.
- OpenCode logs from the packaged launch window show repeated `EIO: i/o error, write exception` and `Aborted process` after pty/output shutdown, not a long-lived OpenCode process.
- Identified renderer output handling as a likely contributor: every terminal output chunk caused React state updates even when terminal activity state did not change.
- Added equality guards around terminal activity updates and changed shared tab mapping to preserve state identity when a mapper returns the same tab.
- Packed a fresh local app at `release/mac-arm64/SharkBay.app`.

## Verification
- Inspected source, `dist-electron`, `dist/renderer`, `release/latest-mac.yml`, `release/builder-debug.yml`, and `release/SharkBay-0.1.0-arm64-mac.zip`.
- Sampled the running packaged `/Applications/SharkBay.app` renderer/core processes and inspected OpenCode logs from the matching packaged launch window.
- `npm run typecheck`
- `npm test` passed: 36 test files, 114 tests.
- `npm run pack` succeeded and produced `release/mac-arm64/SharkBay.app`.
- Checked the new packaged `app.asar` contains the renderer activity guard and existing `inputFire` path.

## Notes
- Treat `.sharkbay/team-context/` as read-only.
- Related prior task: `Q24IBU-u3960864-m81ae10`.
- Current running `/Applications/SharkBay.app` was not killed or replaced because it was hosting the active session; use the freshly packed `release/mac-arm64/SharkBay.app` for manual packaged verification.
