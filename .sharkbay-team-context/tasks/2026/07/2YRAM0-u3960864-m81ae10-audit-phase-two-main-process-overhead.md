---
kind: sharkbay_task
taskId: 2YRAM0-u3960864-m81ae10
taskTag: 2YRAM0
mode: task
title: Audit phase two main process overhead reduction
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f3fd9-becc-7ba1-b5a1-549001149a38
branch: audit
commits:
  - a24f7efe0acf4d1c9150ce410db0c6075baba20c
createdAt: 2026-07-08T15:45:49Z
updatedAt: 2026-07-08T15:48:30Z
completedAt: 2026-07-08T15:48:30Z
---

## Summary
Reduced one low-risk source of main-process runtime overhead around terminal title inspection.

## Files
- src/main/terminal.ts
- tests/terminal.test.ts
- .sharkbay/tasks/2YRAM0-u3960864-m81ae10-audit-phase-two-main-process-overhead.md

## Work
- Created the task on branch `audit`.
- Scope: use CodeGraph to inspect terminal title polling, session status watchers, and startup/backfill paths before making any main-process change.
- Used CodeGraph to locate `TerminalManager`, `AgentSessionWatcher`, and token usage backfill paths.
- Found token usage backfill already has stat-based short-circuits and AgentSessionWatcher already caches transcript discovery, while terminal title inspection can still call macOS `lsof` every second per running terminal.
- Selected a low-risk terminal title optimization: skip cwd inspection while a non-shell foreground process or service terminal is active, because the displayed title does not depend on cwd in those states.
- Added `shouldInspectTerminalCwd` and changed `TerminalManager.refreshTitle` to update foreground process first, then call cwd inspection only when shell foreground state means cwd can affect the title/current cwd.
- Added a terminal unit test for the cwd inspection decision.

## Verification
- `npm run typecheck` passed.
- `npx vitest run tests/terminal.test.ts` passed: 1 file, 11 tests.
- `npm test` passed: 57 files, 321 tests.
- `git diff --check` passed.
- `codegraph sync .` completed after the edit.
- `git status --short` was clean after commit.

## Notes
- Success criteria: identify the main-process overhead path, make only a low-risk scoped change if appropriate, and pass targeted/full verification.
