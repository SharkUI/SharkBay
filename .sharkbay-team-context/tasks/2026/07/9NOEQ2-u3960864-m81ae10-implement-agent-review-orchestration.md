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
updatedAt: 2026-07-13T12:02:07Z
completedAt: 2026-07-13T12:02:07Z
---

## Summary

Implemented agent-initiated Review orchestration: a Codex master can asynchronously launch an OpenCode or CodeWhale reviewer through `review.sh`, receive a validated report callback in its original TUI, and inspect the visible background Review tab. The control plane is independent of MCP, agent configuration, and hooks.

## Files

- `.sharkbay/tasks/9NOEQ2-u3960864-m81ae10-implement-agent-review-orchestration.md`
- `.sharkbay/harness/protocol.md`
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
- Began a user-requested live end-to-end verification by launching an OpenCode review from the parent Codex Terminal without using the blocking `wait` fallback.
- The first live `start` exposed a slow-response socket bug: the client half-closed its write side, allowing the server connection to close before asynchronous reviewer startup returned JSON. Reopened the task to fix the transport timing and add a delayed-response regression test.
- After applying the transport fix, live OpenCode run `review-24c83c6b-34ee-437a-870e-9f51541ad77b` started successfully in reviewer Terminal `term-mrj5lbnf-16`; reserved report: `.sharkbay/reviews/9NOEQ2-M29H3V.md`. No blocking `wait` command was used.
- Received the automatic completion prompt for the first live run `review-0d39a744-977a-4082-aa95-7ca1ae394d9f` and read `.sharkbay/reviews/9NOEQ2-NWFAC8.md`, proving the full OpenCode complete -> SharkBay validation -> real Codex TUI injection path. The duplicate second run was cancelled.
- Assessed the implementation Review: the reported Major is resolved for the idle Codex state by this live callback; accepted focused fixes for response redaction, empty failed-report cleanup, Review Tab fallback mounting, and the stopped-SharkBay client error.
- Applied the accepted fixes: reviewer callers cannot see the parent Terminal id; failed/cancelled runs remove only empty reserved reports; automated Review tabs fall back to the matching project space; stopped SharkBay clients return a concise error; the bootstrap prompt documents single-line draft detection and the `status` fallback.
- Kept the remaining Minor findings unchanged where the current invariant is stronger or reliability would regress: exact reserved-path validation already constrains report names, notification retry remains unbounded for eventual delivery, and the renderer origin field is harmless protocol context.
- Removed the cancelled duplicate run's empty report. The live-installed control client received the same one-line socket write fix so this verification could continue before the next packaged rebuild.
- Reopened the task to move detailed Review usage guidance out of the bootstrap prompt and into the generated harness protocol; bootstrap should only advertise the mechanism and direct the agent to the protocol.
- Added the Review lifecycle and commands to the generated protocol while reducing bootstrap guidance to a one-sentence capability pointer; added tests that keep command details out of bootstrap.

## Verification

- `npx vitest run tests/review-runs.test.ts tests/terminal.test.ts tests/harness.test.ts` passed (40 tests), including empty/symlink report rejection, retryable completion, startup cleanup, notification draft protection, and input-race buffering.
- `npm run typecheck` passed for renderer and Node TypeScript configurations.
- `npx vitest run tests/review-control-server.test.ts tests/review-runs.test.ts tests/harness.test.ts` passed (29 tests), including delayed socket responses, stopped-SharkBay errors, caller-specific response redaction, and empty failed-report cleanup.
- `npm test` passed: 60 test files and 330 tests, including existing OpenCode, CodeWhale, and hook suites.
- `npm run build` passed; Electron TypeScript and the Vite renderer production bundle were generated successfully.
- `git diff --check` passed; `git diff --name-only -- src/main/hooks` returned no changes.
- Live end-to-end OpenCode Review completed and automatically submitted its fixed completion prompt into this real Codex TUI without `wait`; the report was then read by the parent agent.
- `npx vitest run tests/harness.test.ts` passed (25 tests), covering generated protocol Review guidance and the detail-free bootstrap pointer.
- `npm run typecheck` passed after the protocol/bootstrap guidance split.
- Final `git diff --check` passed; the current harness protocol contains the Review section and `src/main/hooks` remains unchanged.

## Notes

- Approved design task: `ILSX66-u3960864-m81ae10`.
- Review report: `.sharkbay/reviews/ILSX66-MXCRCZ.md`.
- Design spec: `.sharkbay/specs/agent-review-orchestration/design.md`.
- Implementation Review: `.sharkbay/reviews/9NOEQ2-NWFAC8.md`.
- Source changed after the user's current package was built; another rebuild/restart is required to deploy all reviewed follow-up fixes. The current live-installed control client contains only the transport write fix used for this end-to-end run.
- No commit has been created.

## Reviews

- 实现与设计/任务声明吻合、四项 Verification 全部复现、hooks 边界守住；Codex master TUI 注入仍无真实验证且复用 OpenCode 30ms 延迟为 Major，余 8 项 Minor — `.sharkbay/reviews/9NOEQ2-NWFAC8.md` (2026-07-13T11:51:04Z)
