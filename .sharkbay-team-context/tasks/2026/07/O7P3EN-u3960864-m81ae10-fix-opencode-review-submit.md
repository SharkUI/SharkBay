---
kind: sharkbay_task
taskId: O7P3EN-u3960864-m81ae10
taskTag: O7P3EN
mode: quick
title: Fix OpenCode review bootstrap submission
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f5a41-2f28-75b2-8f70-3a2a31cbf82d
branch: main
createdAt: 2026-07-13T07:35:48Z
updatedAt: 2026-07-13T07:40:35Z
completedAt: 2026-07-13T07:40:35Z
---

## Summary

OpenCode review sessions now submit the delayed bootstrap prompt automatically. SharkBay writes the prompt first and sends Enter as a separate PTY write 30ms later, matching the established TUI-safe input sequence.

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
- Scoped the new Enter write to OpenCode; CodeWhale shares delayed prompt injection but has a documented incompatible `\r` behavior and remains unchanged.
- Ran CodeGraph affected analysis for the changed runtime and test files; it identified the new terminal bootstrap regression test.

## Verification

- `npx vitest run tests/terminal-bootstrap.test.ts` — failed before the fix because the second PTY write was missing, then passed after the fix.
- `npx vitest run tests/terminal.test.ts tests/terminal-bootstrap.test.ts tests/harness.test.ts` — 3 files, 37 tests passed.
- `npm run typecheck` — passed.
- `npm test` — 58 files, 324 tests passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- Real OpenCode Review launch was not run automatically because submitting the review prompt would invoke a configured model and incur usage; UI runtime confirmation remains manual.

## Notes

- Related team-context tasks: `T2K8M7-u3960864-m81ae10`, `Q24IBU-u3960864-m81ae10`, `L4V8N3-u3960864-m81ae10`, `P6T9R4-u3960864-m81ae10`, `W2R6K8-u3960864-m81ae10`, and `RVW7K2-u3960864-m81ae10`.
- `.sharkbay/team-context/` remains read-only.
- No commit was created.
