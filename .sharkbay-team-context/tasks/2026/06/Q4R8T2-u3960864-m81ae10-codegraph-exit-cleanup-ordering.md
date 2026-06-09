---
kind: sharkbay_task
taskId: Q4R8T2-u3960864-m81ae10
taskTag: Q4R8T2
mode: task
title: App exit cleanup ordering for CodeGraph
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 9e2de4aa-5299-4c79-bfb6-8a363f3ba64f
branch: fix/node-cpu-codegraph-lifecycle
dependsOn:
  - J7P2M5-u3960864-m81ae10
createdAt: 2026-06-09T09:33:03Z
updatedAt: 2026-06-09T10:42:26Z
completedAt: 2026-06-09T10:42:26Z
commits:
  - 0dc4f80f
---

## Summary
App exit now cancels active CodeGraph jobs and closes terminals through the core
process (awaited) BEFORE the core utility process is killed and before the app
quits, so no codegraph/bundled-node process group is orphaned. Also fixed a
latent bug where dispose marked itself disposed before issuing cleanup calls,
which silently rejected them. Part 3 of issue #15.

## Files
- electron/core-client.ts
- electron/ipc.ts
- electron/main.ts
- tests/core-client-dispose.test.ts

## Work
- CoreClient.dispose: added a separate `disposing` guard so cleanup calls run
  while the client is still live; now calls cancelAllCodeGraphJobs (await) then
  closeAllTerminalSessions (await), marks disposed, then child.kill(). Previously
  `disposed=true` was set first, so the cleanup call rejected immediately.
- ipc.ts: added awaitable shutdownCore() (await core.dispose, then tear down
  browser/sync/task-watcher resources); removed the now-orphaned synchronous
  closeAllTerminalSessions export that only main.ts referenced.
- main.ts: before-quit now event.preventDefault(), runs shutdownCore(), and
  calls app.quit() in finally, guarded by a cleanupComplete flag to avoid a
  loop. Removed the unused closeAllTerminalSessions import.
- Added tests/core-client-dispose.test.ts: verifies cancel->close->kill ordering
  and dispose idempotency (electron mocked).

## Verification
- `npm run typecheck` — pass.
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/core-client-dispose.test.ts` — 2 pass.
- `npm run build` — pass.
- Full `npm test`: 182 pass; same 2 pre-existing unrelated failures
  (prompt-store, harness) as prior tasks.
- Manual exit scenario (issue checklist) not run in this environment; covered by
  the ordering unit test instead.

## Notes
- Issue: https://github.com/SharkUI/SharkBay/issues/15 (problem 1, cleanup).
- Built on J7P2M5 (cancelAllCodeGraphJobs exposed via protocol/host).
- Completes the CodeGraph track (A/B/C) for issue #15 problem 1.
