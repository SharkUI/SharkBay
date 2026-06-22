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
updatedAt: 2026-06-22T11:22:17Z
completedAt: 2026-06-22T11:22:17Z
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
- Reopened task to address review finding T6R9P4-XA5G69: missing agent CLI availability should not block restoration of unrelated tabs.
- Added `agentClisReady` so restore waits for CLI scanning to finish, then restores non-agent tabs even when no agent CLI is installed.
- Added ANSI reset before the restored terminal notice to reduce display artifacts after bounded output truncation.

## Verification
- `codegraph affected src/renderer/App.tsx src/main/terminal.ts src/shared/types.ts src/renderer/types.ts src/shared/agent-session-restore.ts`
- `npm run typecheck`
- `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- `git diff --check -- src/renderer/App.tsx src/main/terminal.ts src/shared/types.ts src/renderer/types.ts src/shared/agent-session-restore.ts tests/agent-session-restore.test.ts .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- `npm run build`
- Follow-up verification after review fix: `npm run typecheck`
- Follow-up verification after review fix: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after review fix: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after review fix: `npm run build`

## Notes
- Relevant team context includes agent session restore/session id handoff, per-session prompt history, shell history scoping, island tab restore behavior, and app exit cleanup ordering.
- No commit produced in this task.
- Shell process state itself is not restored; restarted shell tabs display the saved terminal buffer and start a new shell process in the last observed cwd.
- Review report: `.sharkbay/reviews/T6R9P4-XA5G69.md`.

## Reviews
- 通过（Approve）：实现与 Summary/Files/Work 一致，typecheck 与定向测试通过，无阻塞项；仅少量边缘情况与测试覆盖建议 — `.sharkbay/reviews/T6R9P4-XA5G69.md` (2026-06-22T11:13:58Z)
