---
kind: sharkbay_task
taskId: T6R9P4-u3960864-m81ae10
taskTag: T6R9P4
mode: task
title: Restore open tabs on app restart
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019eedf3-dd71-7dd3-8cb3-6b34baf8b812
branch: main
createdAt: 2026-06-22T10:52:32Z
updatedAt: 2026-06-22T11:02:13Z
completedAt: 2026-06-22T11:02:13Z
---

## Summary
Open terminal, agent, browser, and editor tabs now persist in the renderer and are restored after app restart. Browser tabs reuse the existing persistent Electron browser partition, agent restore tabs use normal agent titles, and shell tabs restore cwd plus a bounded terminal output snapshot.

## Files
- .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md
- src/main/terminal.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/agent-session-restore.ts
- src/shared/types.ts
- tests/agent-session-restore.test.ts

## Work
- Started task after checking team context for related tab restore, prompt history, and browser/session work.
- Added renderer localStorage persistence for terminal spaces, tab order, active tab, browser URLs, editor paths, service tabs, agent restore metadata, shell cwd, and bounded terminal output snapshots.
- Exposed `currentCwdUri` on terminal sessions so shell tabs can restart in the last observed working directory when it remains inside the configured project boundary.
- Changed agent restore command titles to the normal agent label instead of `Restore ...`.
- Confirmed browser cookies and storage already use `partition: "persist:sharkbay-browser"` in `BrowserManager`.
- Kept localStorage parsing minimal because SharkBay owns the snapshot key.

## Verification
- `codegraph affected src/renderer/App.tsx src/main/terminal.ts src/shared/types.ts src/renderer/types.ts src/shared/agent-session-restore.ts`
- `npm run typecheck`
- `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- `git diff --check -- src/renderer/App.tsx src/main/terminal.ts src/shared/types.ts src/renderer/types.ts src/shared/agent-session-restore.ts tests/agent-session-restore.test.ts .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- `npm run build`

## Notes
- Relevant team context includes agent session restore/session id handoff, per-session prompt history, shell history scoping, island tab restore behavior, and app exit cleanup ordering.
- No commit produced in this task.
- Shell process state itself is not restored; restarted shell tabs display the saved terminal buffer and start a new shell process in the last observed cwd.
