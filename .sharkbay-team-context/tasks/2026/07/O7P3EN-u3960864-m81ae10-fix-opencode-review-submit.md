---
kind: sharkbay_task
taskId: O7P3EN-u3960864-m81ae10
taskTag: O7P3EN
mode: quick
title: Fix delayed review bootstrap submission
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f5a41-2f28-75b2-8f70-3a2a31cbf82d
branch: main
createdAt: 2026-07-13T07:35:48Z
updatedAt: 2026-07-13T09:04:14Z
completedAt: 2026-07-13T09:04:14Z
commit: ec21ee5e
---

## Summary

OpenCode and CodeWhale review sessions now submit delayed bootstrap prompts automatically. OpenCode sends Enter after 30ms; CodeWhale waits 250ms to clear its 120ms paste-suppression window.

## Files

- `.sharkbay/tasks/O7P3EN-u3960864-m81ae10-fix-opencode-review-submit.md`
- `src/main/terminal.ts`
- `tests/terminal-bootstrap.test.ts`

## Work

- Traced the OpenCode launch path with CodeGraph and inspected prior bootstrap/TUI fixes.
- Confirmed delayed bootstrap injection writes only backspaces plus prompt text and never sends Enter.
- Added a failing PTY-level regression test that reproduced the missing second write after the prompt was injected.
- Reused the established terminal input sequence: write text first, then send `\r` in a separate write 30ms later so TUI paste handling cannot absorb it.
- Kept the existing delayed interactive launch and avoided the previously problematic OpenCode `--prompt` startup path.
- Initially scoped the new Enter write to OpenCode, then reopened the task when the user confirmed CodeWhale had the same visible failure.
- Ran CodeGraph affected analysis for the changed runtime and test files; it identified the new terminal bootstrap regression test.
- Reopened after the user confirmed CodeWhale had the same visible missing-Enter problem and investigated its required Enter sequence before extending the fix.
- Matched the installed CodeWhale `v0.8.47` binary to official source commit `70743997ca503bcc8b25d5bbdbd0247ab4da5e35`.
- Found CodeWhale's non-bracketed paste detector suppresses Enter for 120ms after rapid text input, so the existing 30ms sequence is interpreted as a pasted newline rather than submit.
- Kept OpenCode at 30ms and gave CodeWhale a 250ms submit delay, with PTY timing coverage for both agents.
- Extended the PTY regression test to cover both agents; before the runtime change only the CodeWhale case failed with a missing `\r` write.
- Added CodeWhale's 250ms delayed Enter while preserving OpenCode's existing 30ms sequence; both targeted cases now pass.
- Ran CodeGraph affected analysis for the final source and test pair; it selected `tests/terminal-bootstrap.test.ts`.
- Reopened for commit preparation after the user confirmed both OpenCode and CodeWhale work in the real UI.
- Committed the terminal timing fix and regression coverage as `ec21ee5e`.

## Verification

- `npx vitest run tests/terminal-bootstrap.test.ts` — reproduced the missing second PTY write before each agent's fix; final run passed 2 tests.
- `npx vitest run tests/terminal.test.ts tests/terminal-bootstrap.test.ts tests/harness.test.ts` — 3 files, 38 tests passed.
- `codegraph affected -p . src/main/terminal.ts tests/terminal-bootstrap.test.ts` — selected the terminal bootstrap regression test.
- `npm run typecheck` — passed.
- `npm test` — 58 files, 325 tests passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- Real OpenCode and CodeWhale Review launches were not run automatically because submitting the prompts would invoke configured models and incur usage; UI runtime confirmation remains manual.
- User confirmed both agents submit their review bootstrap prompts successfully in the real UI.
- `git show --stat --oneline HEAD` — confirmed commit `ec21ee5e` contains only `src/main/terminal.ts` and `tests/terminal-bootstrap.test.ts`.
- `git status --short` — clean after the commit.

## Notes

- Related team-context tasks: `T2K8M7-u3960864-m81ae10`, `Q24IBU-u3960864-m81ae10`, `L4V8N3-u3960864-m81ae10`, `P6T9R4-u3960864-m81ae10`, `W2R6K8-u3960864-m81ae10`, and `RVW7K2-u3960864-m81ae10`.
- `.sharkbay/team-context/` remains read-only.
- Commit: `ec21ee5e92e900288ce72ebae2e085eb72617cea`.
