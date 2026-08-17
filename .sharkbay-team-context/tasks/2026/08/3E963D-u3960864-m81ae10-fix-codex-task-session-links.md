---
kind: sharkbay_task
taskId: 3E963D-u3960864-m81ae10
taskTag: 3E963D
mode: task
title: Fix Codex task session links
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.6
sessionId: 01a01005-13c0-7760-9cc3-09dbd93f77cb
branch: main
createdAt: 2026-08-17T15:02:18Z
updatedAt: 2026-08-17T15:06:38Z
completedAt: 2026-08-17T15:06:38Z
---

## Summary

新版 Codex 创建的 SharkBay 任务现在可稳定记录原生 Session ID：优先使用当前线程环境，并在缺失时沿祖先进程查找 transcript。恢复入口可继续使用官方稳定的 `codex resume <SESSION_ID>`。

## Files

- `.sharkbay/tasks/3E963D-u3960864-m81ae10-fix-codex-task-session-links.md`
- `src/main/harness.ts`
- `tests/harness.test.ts`
- `.sharkbay/harness/agent-session-id.sh`

## Work

- Confirmed the current helper exits with `codex session transcript not found`, so new task records omit `sessionId` and the UI cannot build a restore action.
- Related prior tasks: `CXSID7-u3960864-m81ae10`, `FCSID2-u3960864-m81ae10`, and `BFSID3-u3960864-m81ae10`.
- Keep GitHub identity and permission failures strict; this task does not add local-only fallback behavior.
- Limit this task to the product fix for future tasks; historical task backfill remains separate.
- Added regressions for the current Codex thread environment and for a shell-parent/Codex-ancestor process chain; both failed against the previous helper.
- Updated the managed helper to prefer `CODEX_THREAD_ID` for fresh Codex sessions and walk ancestor processes only as a compatibility fallback.
- Kept the existing restored-session priority and transcript metadata compatibility; no GitHub install behavior or historical task record was changed.

## Verification

- Initial focused run failed only in the two new regressions with `codex session transcript not found`, confirming the bug.
- `npm test -- tests/harness.test.ts`: 26/26 tests passed after the final test simplification.
- `sh -n .sharkbay/harness/agent-session-id.sh`: passed.
- Live helper check returned the same ID as the current `CODEX_THREAD_ID`: `01a01005-13c0-7760-9cc3-09dbd93f77cb`.
- Live fallback check with `CODEX_THREAD_ID` cleared also returned `01a01005-13c0-7760-9cc3-09dbd93f77cb` through ancestor transcript discovery.
- `codegraph affected src/main/harness.ts tests/harness.test.ts`: only `tests/harness.test.ts` affected.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

## Notes

- Official OpenAI documentation continues to define `codex resume <SESSION_ID>` as stable, but does not document transcript file or process-layout internals.
- Existing Codex task records without `sessionId` were intentionally not backfilled in this product-fix task.
