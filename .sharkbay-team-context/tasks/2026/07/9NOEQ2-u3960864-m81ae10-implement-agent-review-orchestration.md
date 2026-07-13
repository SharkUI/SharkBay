---
kind: sharkbay_task
taskId: 9NOEQ2-u3960864-m81ae10
taskTag: 9NOEQ2
mode: task
title: Implement agent-initiated review orchestration
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f5a41-2f28-75b2-8f70-3a2a31cbf82d
branch: main
createdAt: 2026-07-13T11:08:53Z
updatedAt: 2026-07-13T11:38:48Z
completedAt: 2026-07-13T11:38:48Z
---

## Summary

Implemented agent-initiated Review orchestration: a Codex master can asynchronously launch an OpenCode or CodeWhale reviewer through `review.sh`, receive a validated report callback in its original TUI, and inspect the visible background Review tab. The control plane is independent of MCP, agent configuration, and hooks.

## Files

- `.sharkbay/tasks/9NOEQ2-u3960864-m81ae10-implement-agent-review-orchestration.md`
- `.sharkbay/specs/agent-review-orchestration/design.md`
- `src/shared/types.ts`
- `src/shared/ipc-channels.ts`
- `src/core/core-protocol.ts`
- `src/core/core-service.ts`
- `src/core/execution-provider.ts`
- `src/providers/local/local-provider.ts`
- `src/main/terminal.ts`
- `src/main/harness.ts`
- `src/main/review-runs.ts`
- `src/main/review-control-server.ts`
- `electron/core-host.ts`
- `electron/ipc.ts`
- `electron/preload.mts`
- `src/renderer/types.ts`
- `src/renderer/App.tsx`
- `tests/terminal.test.ts`
- `tests/harness.test.ts`
- `tests/review-runs.test.ts`
- `tests/review-control-server.test.ts`
- `tests/ipc-channels.test.ts`

## Work

- Started implementation after Review `ILSX66-MXCRCZ` approved the design with no blockers or major findings.
- Preserved the hard boundary: no MCP, no agent configuration changes, no hook code/config/protocol changes, and no ReviewRun dependency on hook events.
- Accepted Review follow-ups: verify Codex master injection first; document single-line draft detection limits; keep invalid complete requests retryable; distinguish vendor and Terminal session environment variables; justify the independent socket by request/response semantics.
- Planned branch: `codex/agent-review-orchestration`.
- Created and switched to `codex/agent-review-orchestration`; the task's original creation branch remains `main` per protocol.
- Fixed implementation sequence and success criteria: atomically reject parent-TUI injection while a single-line draft exists; start Review asynchronously and return a run id; validate the exact reserved non-empty report before completion; keep invalid completion retryable; attach the reviewer PTY as a background tab; inject a fixed completion prompt into the parent Codex PTY without using hooks.
- Implemented and tested the terminal control contract, in-memory ReviewRun lifecycle, exact report validation, retryable draft conflict handling, independent request/response Unix socket client, and managed `review.sh` harness entry.
- Connected Review orchestration to Electron IPC/preload and the renderer: automated Review sessions attach to the parent project as background tabs, status updates drive tab lights, and closing a running Review tab cancels its run.
- Preserved separate vendor and SharkBay terminal identities with `SHARKBAY_TERMINAL_SESSION_ID`; buffered user keystrokes during the short notification submit delay so they cannot merge into the injected completion prompt.
- Kept all Review control traffic on the new request/response socket; no hook source, connector, protocol, or installed hook configuration was modified.

## Verification

- `npx vitest run tests/review-runs.test.ts tests/terminal.test.ts tests/harness.test.ts` passed (40 tests), including empty/symlink report rejection, retryable completion, startup cleanup, notification draft protection, and input-race buffering.
- `npm run typecheck` passed for renderer and Node TypeScript configurations.
- `npm test` passed: 60 test files and 330 tests, including existing OpenCode, CodeWhale, and hook suites.
- `npm run build` passed; Electron TypeScript and the Vite renderer production bundle were generated successfully.
- `git diff --check` passed; `git diff --name-only -- src/main/hooks` returned no changes.
- A nested live Codex model session was not launched; parent notification mechanics were verified with a real local PTY to avoid an external model call during automated tests.

## Notes

- Approved design task: `ILSX66-u3960864-m81ae10`.
- Review report: `.sharkbay/reviews/ILSX66-MXCRCZ.md`.
- Design spec: `.sharkbay/specs/agent-review-orchestration/design.md`.
- No commit has been created.
