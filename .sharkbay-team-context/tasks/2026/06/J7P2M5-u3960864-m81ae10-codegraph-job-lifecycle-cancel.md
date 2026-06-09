---
kind: sharkbay_task
taskId: J7P2M5-u3960864-m81ae10
taskTag: J7P2M5
mode: task
title: CodeGraph job lifecycle and cancel
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 9e2de4aa-5299-4c79-bfb6-8a363f3ba64f
branch: fix/node-cpu-codegraph-lifecycle
dependsOn:
  - G8K4N2-u3960864-m81ae10
createdAt: 2026-06-09T09:33:03Z
updatedAt: 2026-06-09T10:27:06Z
completedAt: 2026-06-09T10:27:06Z
commits:
  - b5146b2e
---

## Summary
Gave CodeGraphManager a cancellable job lifecycle. CodeGraph commands now run
in a detached process group via spawn, so timeout/cancel terminates the whole
tree (npm shim + bundled runtime) with SIGTERM then SIGKILL. init/sync jobs are
tracked per project and can be cancelled individually or all at once; cancelAll
is exposed through core-protocol for Task C. Part 2 of issue #15.

## Files
- src/core/codegraph-manager.ts
- src/core/core-service.ts
- src/core/core-protocol.ts
- electron/core-host.ts
- tests/codegraph-manager.test.ts

## Work
- Replaced execFile/promisify with runCodeGraphCommandInGroup: spawn with
  detached:true, streamed stdout/stderr capture, timeout handling, and
  AbortSignal support.
- Added terminateProcessGroup helper: process.kill(-pid, SIGTERM) then a
  grace-period SIGKILL escalation, with single-process fallback.
- Tracked active maintenance jobs in an AbortController map keyed by projectUri;
  threaded the signal into init/sync; added cancelProject, cancelAll, and
  hasActiveJobs. Cancelled jobs resolve to an "uninitialized / indexing
  cancelled" status instead of an error.
- Exposed cancelAllCodeGraphJobs via core-service, core-protocol, and the
  core-host dispatcher for the Task C shutdown path.
- Added manager tests for signal threading, single cancel, cancelAll, and real
  detached-process tests for stdout capture, abort termination, and timeout.

## Verification
- `npm run typecheck` — pass.
- `env -u SHARKBAY_RESTORED_SESSION_ID npm test -- tests/codegraph-manager.test.ts` — 20 pass (incl. new cancel/timeout/process-group cases).
- `npm run build` — pass.
- Full `npm test`: 180 pass; same 2 pre-existing unrelated failures
  (prompt-store, harness) as recorded in Task A.

## Notes
- Issue: https://github.com/SharkUI/SharkBay/issues/15 (problem 1, process mgmt).
- Built on G8K4N2 (jobs now start only on explicit action).
- cancelAllCodeGraphJobs is the hook Task C (Q4R8T2) will call from app exit.
- Injectable CommandRunner kept for tests; production default is the
  process-group spawn runner.
