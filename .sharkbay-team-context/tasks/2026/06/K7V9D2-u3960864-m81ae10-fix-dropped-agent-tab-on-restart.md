---
kind: sharkbay_task
taskId: K7V9D2-u3960864-m81ae10
taskTag: K7V9D2
mode: task
title: Fix dropped AI agent tab on app restart
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 06aa2ade-aba6-47fb-b15f-9662d46fcd19
branch: main
createdAt: 2026-06-23T13:27:40Z
updatedAt: 2026-06-23T13:48:04Z
completedAt: 2026-06-23T13:48:04Z
commits:
  - 6d51cf01
---

## Summary
After app restart, the restored tab set frequently loses one tab (high probability),
typically the AI agent tab. Root cause: the renderer terminal-space restore effect runs
asynchronously behind a one-shot ref guard set up front, but its cleanup aborts the
in-flight restore on any dependency change; during startup the early agent-CLI scan marks
the restore ready before the selected project loads, and when the project list resolves the
effect re-runs, cancels the running restore, and never resumes — dropping the not-yet-created
tabs. Fix makes restore abort only on real unmount and reads volatile inputs via refs so
benign re-renders cannot cancel it.

## Files
- .sharkbay/tasks/K7V9D2-u3960864-m81ae10-fix-dropped-agent-tab-on-restart.md
- src/renderer/App.tsx (restore effect + new refs; committed in 6d51cf01 by a concurrent session — see Notes)

## Work
- Investigated restore/persist logic in src/renderer/App.tsx and the agent-CLI scan effect.
- Confirmed root cause in committed code (T6R9P4 series, last commit 750b5e15):
  - Restore effect (App.tsx ~1771-1882) sets `restoredSpaces.current = true` up front, runs
    an async `restoreSpaces()` loop, and registers cleanup `() => { cancelled = true; }`.
  - Deps `[agentClis, agentClisReady, bridgeAvailable, candidate?.id, flushTerminalSpacesSnapshot]`.
  - Startup race: agent-CLI scan runs first with `cwdUri: undefined` (selectedCandidate null
    until projects load) and flips `agentClisReady` true, so restore can start before the
    selected project/agent list is settled. When `candidates` load, `candidate?.id` /
    `agentClis` / `agentClisReady` change → effect re-runs → cleanup sets `cancelled = true`
    → in-flight restore bails at its next checkpoint and never resumes (guard already true),
    permanently dropping tabs after the abort point.
  - The agent tab is the high-probability casualty: usually opened last (last in persisted
    order) and slowest to recreate (prepareAgentLaunch / path reservation), so it is most
    exposed to the cancellation window.
- Verified buildAgentSessionRestoreCommand (src/shared/agent-session-restore.ts) does NOT skip
  on empty `agentClis`; it falls back to the agent default executable. It returns null only
  when sessionId is missing or the agent name is not inferable. So the drop is the
  cancellation, not an empty-agentClis skip.
- App uses React.StrictMode (src/renderer/main.tsx), so the current cleanup also aborts restore
  on dev double-mount; the planned fix is correct under StrictMode and production.
- Implemented the fix in src/renderer/App.tsx (see Implementation). Confirmed on disk via grep:
  agentClisRef x3, candidateRef x3, restoreMountedRef x5; no `cancelled` left in the restore
  effect (the remaining `cancelled` usages at ~1189 belong to the separate agent-CLI scan effect
  and at ~3431+ to other unrelated effects, all correctly untouched).

## Implementation (done)
- Add `restoreMountedRef` (useRef(true)) set false only on real unmount (empty-deps effect),
  so restore distinguishes unmount from benign re-render.
- Add `agentClisRef` and `candidateRef` (synced via effects, mirroring hookSnapshotByTerminalIdRef)
  so the async restore reads the latest values without listing them as effect deps.
- Rewrite the restore effect: drop `let cancelled`; replace the two `if (cancelled) return;`
  checks with `if (!restoreMountedRef.current) return;`; use `availableAgents: agentClisRef.current`;
  change `if (!cancelled)` to `if (restoreMountedRef.current)`; use `candidateRef.current?.id`;
  remove the cancel cleanup; trim deps to `[agentClisReady, bridgeAvailable, flushTerminalSpacesSnapshot]`.
- No automated regression test added (see Verification for the harness rationale).

## Verification
- `npm run typecheck` — PASS (tsc renderer + node, no errors).
- `npm run build` — PASS (tsc node + vite build, 76 modules).
- `npm test` — 211 passed, 1 failed. The single failure is `tests/ipc-channels.test.ts`
  (exact-match assertion on the IPC channel map). It is unrelated to this renderer-only fix and
  pre-existing: it also fails on the committed code without my App.tsx change (introduced by the
  other sessions' Cmd+F search / island / share commits, which changed IPC channels). Not in scope
  for this task.
- No renderer-component regression test added: the repo has no component test harness (vitest runs
  in the `node` environment, includes only `tests/**/*.test.ts`, and has no @testing-library/react
  or jsdom). The fix is a React effect-lifecycle correction not unit-testable without adding that
  stack or risky extraction from the 5k-line component. Final behavior to be confirmed by the user
  restarting the app and checking the agent tab is restored.

## Notes
- Builds directly on prior task T6R9P4-u3960864-m81ae10 (Restore open tabs on app restart),
  which introduced this restore logic and the `agentClisReady` gate.
- Possible follow-up (not in scope): defer the restore start until the agent-CLI scan for the
  selected project completes, so restored agent tabs always use the detected executable path
  instead of the default command. Current fix uses agentClisRef so late-processed agent tabs
  pick up the real list when available; PATH-installed agents work with the default command.
- Commit handling (RESOLVED per user): I did not run git commit. While verifying, a concurrent
  session committed `6d51cf01` ("Clear stopped/approval state when clicking an island session"),
  which changed only src/renderer/App.tsx (+28/-8) and whose diff contains BOTH that session's
  island-click change AND this task's entire restore fix, bundled together. User chose to leave
  history as-is, so `6d51cf01` is recorded as this task's carrying commit (note: it also includes
  the unrelated island-click change and carries that session's commit message). History was not
  rewritten. Branch was ahead of origin/main by 3 local (un-pushed) commits at completion; this
  task did not push.
