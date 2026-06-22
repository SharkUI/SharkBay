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
updatedAt: 2026-06-22T13:45:15Z
completedAt: 2026-06-22T13:45:15Z
commits:
  - 771f089a
  - 54e2159a
  - 84526ce9
  - 84ee49ee
---

## Summary
Open terminal, agent, browser, and editor tabs now persist in the renderer and are restored after app restart. Browser tabs reuse the existing persistent Electron browser partition, agent restore tabs use normal agent titles, and shell tabs restore cwd plus a bounded terminal output snapshot.
Review/Artifact agent tabs now persist the real hook session id once it is observed and only restore via agent CLI resume; agent tabs without a resumable session id are no longer silently relaunched as new sessions.
Restored agent tabs also keep their persisted tab title, so Review/Artifact tabs continue to show their original `Review ...` or `Artifact ...` title after restart.

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
- Reopened task after user reported restored zsh shell buffers showing noisy standalone `%` prompt markers.
- Cleaned restored terminal output by stripping common terminal control sequences, normalizing carriage returns, and dropping standalone `%` marker lines before replay.
- Reopened task to persist the currently selected project across app restarts.
- Persisted the active project id in localStorage and restored it as the initial `selectedId` when the app starts.
- Reopened task after user reported startup still creates an extra shell tab before restored tabs finish loading.
- Added `terminalSpacesRestored` gating so the selected project auto-shell fallback only runs after tab restore finishes.
- Reopened task after user reported startup showing tabs for the wrong project until manually switching projects.
- Made restore-created terminal, browser, and editor tabs open without activating their project, then restored focus to the selected project after restore completes.
- Reopened task after user reported shell restore adds noisy prompt/notice/prompt lines.
- Removed the explicit restored-buffer notice and trimmed one trailing shell-prompt-looking line from restored output before replay.
- Reopened task after user reported full-screen `top` alternate-screen output is replayed as normal shell history after restart.
- Dropped alternate-screen terminal blocks (`?47`, `?1047`, `?1049`) from restored shell output before ANSI stripping.
- Reopened task to avoid recording alternate-screen output into the persisted shell snapshot in the first place.
- Added per-terminal alternate-screen tracking so snapshot persistence skips full-screen program output until the terminal exits alternate screen.
- Reopened task to replace streaming shell I/O accumulation with current xterm buffer snapshots so `clear` is respected.
- Replaced streaming terminal output accumulation with current xterm buffer snapshots during persistence/exit flush.
- Reopened task to clarify agent tab restore semantics: agent tabs should persist resume metadata, not terminal buffer snapshots.
- Stopped saving terminal buffer output for agent tabs; agent tabs now persist only the metadata needed for CLI resume.
- Preparing a commit for the verified restore behavior changes.
- Committed restore behavior changes in `771f089a`.
- Reopened task after audit follow-up to snapshot xterm normal buffer instead of active buffer when full-screen programs are running.
- Changed terminal buffer snapshot collection to prefer xterm's normal buffer, falling back to active buffer only if normal is unavailable.
- Preparing a follow-up commit for the normal-buffer snapshot change.
- Committed normal-buffer snapshot follow-up in `54e2159a`.
- Reopened task after user reported Review/Artifact tabs are relaunched as new sessions after app restart instead of restoring the original agent session.
- Investigating and fixing persisted agent tab session id capture so restore uses existing hook sessions and never silently starts a replacement Review/Artifact session.
- Persisted terminal spaces now fill missing `hookSessionId` from the current terminal-to-hook snapshot before writing localStorage.
- Hook snapshot changes now trigger the same debounced terminal-space persistence so newly discovered agent session ids are saved before restart.
- Agent tab restore now requires a valid `buildAgentSessionRestoreCommand`; tabs without a resumable hook session id are skipped instead of launching a fresh agent.
- Committed Review/Artifact session-id restore fix in `84526ce9`.
- Reopened task after user reported restored Review/Artifact tab titles do not match their original titles.
- Added persisted agent tab `title` metadata and used it as the restored resume command title, falling back to the normal agent label only when no title was saved.
- Committed Review/Artifact restored title fix in `84ee49ee`.

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
- Follow-up verification after shell buffer cleanup: `npm run typecheck`
- Follow-up verification after shell buffer cleanup: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after shell buffer cleanup: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after shell buffer cleanup: `npm run build`
- Follow-up verification after selected-project persistence: `npm run typecheck`
- Follow-up verification after selected-project persistence: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after selected-project persistence: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after selected-project persistence: `npm run build`
- Follow-up verification after auto-shell gating: `npm run typecheck`
- Follow-up verification after auto-shell gating: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after auto-shell gating: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after auto-shell gating: `npm run build`
- Follow-up verification after restore activation fix: `npm run typecheck`
- Follow-up verification after restore activation fix: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after restore activation fix: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after restore activation fix: `npm run build`
- Follow-up verification after shell restore notice removal: `npm run typecheck`
- Follow-up verification after shell restore notice removal: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after shell restore notice removal: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after shell restore notice removal: `npm run build`
- Follow-up verification after alternate-screen cleanup: `npm run typecheck`
- Follow-up verification after alternate-screen cleanup: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after alternate-screen cleanup: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after alternate-screen cleanup: `npm run build`
- Follow-up verification after alternate-screen snapshot skipping: `npm run typecheck`
- Follow-up verification after alternate-screen snapshot skipping: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after alternate-screen snapshot skipping: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after alternate-screen snapshot skipping: `npm run build`
- Follow-up verification after xterm buffer snapshot persistence: `npm run typecheck`
- Follow-up verification after xterm buffer snapshot persistence: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after xterm buffer snapshot persistence: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after xterm buffer snapshot persistence: `npm run build`
- Follow-up verification after agent restore metadata-only persistence: `npm run typecheck`
- Follow-up verification after agent restore metadata-only persistence: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after agent restore metadata-only persistence: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after agent restore metadata-only persistence: `npm run build`
- Follow-up verification after normal-buffer snapshot change: `npm run typecheck`
- Follow-up verification after normal-buffer snapshot change: `npm test -- tests/agent-session-restore.test.ts tests/renderer-workflow.test.ts`
- Follow-up verification after normal-buffer snapshot change: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after normal-buffer snapshot change: `npm run build`
- Follow-up verification after Review/Artifact restore fix: `npm run typecheck`
- Follow-up verification after Review/Artifact restore fix: `npm test -- tests/renderer-workflow.test.ts tests/agent-session-restore.test.ts`
- Follow-up verification after Review/Artifact restore fix: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after Review/Artifact restore fix: `npm run build`
- Follow-up verification after Review/Artifact title restore fix: `npm run typecheck`
- Follow-up verification after Review/Artifact title restore fix: `npm test -- tests/renderer-workflow.test.ts tests/agent-session-restore.test.ts`
- Follow-up verification after Review/Artifact title restore fix: `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/T6R9P4-u3960864-m81ae10-restore-open-tabs.md`
- Follow-up verification after Review/Artifact title restore fix: `npm run build`

## Notes
- Relevant team context includes agent session restore/session id handoff, per-session prompt history, shell history scoping, island tab restore behavior, and app exit cleanup ordering.
- Shell process state itself is not restored; restarted shell tabs display a saved xterm buffer snapshot and start a new shell process in the last observed cwd.
- Review report: `.sharkbay/reviews/T6R9P4-XA5G69.md`.
- User-reported shell restore artifact: raw pty replay can surface zsh partial-line `%` markers.
- User reported the explicit restored-buffer notice and duplicate prompt lines are too noisy for shell restore.
- User observed `top` full-screen updates remain visible after restarting SharkBay, which should be discarded from restored shell history.
- Persisted shell snapshots should not churn on long-running full-screen terminal programs like `top`.
- User clarified expected model: record the shell tab's displayed content at persistence/quit time, not all historical shell I/O.
- Agent tabs restore through agent CLI resume/restore commands; terminal buffer snapshots are only for non-agent terminal tabs.
- Review/Artifact tabs that never produce a hook session id before persistence cannot be safely restored and should not be recreated automatically.
- Commit produced: `771f089a`.
- Follow-up commit produced: `54e2159a`.
- Follow-up commit produced: `84526ce9`.
- Follow-up commit produced: `84ee49ee`.

## Reviews
- 通过（Approve）：实现与 Summary/Files/Work 一致，typecheck 与定向测试通过，无阻塞项；仅少量边缘情况与测试覆盖建议 — `.sharkbay/reviews/T6R9P4-XA5G69.md` (2026-06-22T11:13:58Z)

## Artifacts
- `.sharkbay/artifacts/T6R9P4-VV0DBR.html` — 展示重启后恢复 terminal、agent、browser、editor 标签页的最终交付、关键代码证据和验证记录 (2026-06-22T13:09:08Z)
- 通过（Approve）：提交 771f089a 工作树干净，改动与 Summary/Files/Work 一致，typecheck 与 12 个定向测试全部通过，边界/分区/agent 元数据声明均经复核；无阻塞项，仅核心新逻辑缺单测与 alternate-screen 快照等次要建议 — `.sharkbay/reviews/T6R9P4-3F2MHQ.md` (2026-06-22T13:06:53Z)
