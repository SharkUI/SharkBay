---
kind: sharkbay_task
taskId: ILSX66-u3960864-m81ae10
taskTag: ILSX66
mode: task
title: Design agent-initiated review orchestration
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f5a41-2f28-75b2-8f70-3a2a31cbf82d
branch: main
createdAt: 2026-07-13T10:41:59Z
updatedAt: 2026-07-13T10:45:50Z
completedAt: 2026-07-13T10:45:50Z
---

## Summary

Documented a review-ready design for a Codex master to launch an OpenCode or CodeWhale Review, receive a completion callback in its TUI, and read the persisted report without MCP, agent configuration changes, or hook changes.

## Files

- `.sharkbay/tasks/ILSX66-u3960864-m81ae10-design-agent-review-orchestration.md`
- `.sharkbay/specs/agent-review-orchestration/design.md`

## Work

- Consolidated the agreed constraints: no MCP, no agent configuration changes, no hook changes or hook dependency, and no second SharkBay instance.
- Chose project harness commands plus a SharkBay-owned request/response control socket as the agent-facing boundary.
- Chose a visible background Review terminal tab and a SharkBay-generated, validated completion prompt injected into the master terminal.
- Reviewed related work `RVW7K2-u3960864-m81ae10`, `T6R9P4-u3960864-m81ae10`, `O7P3EN-u3960864-m81ae10`, `S8B3K6-u3960864-m81ae10`, and `R4V8K2-u3960864-m81ae10`.
- Wrote the linked design spec covering the ReviewRun model, control protocol, harness commands, visible reviewer Tab, explicit completion handshake, master TUI callback, safety boundaries, failure recovery, implementation phases, and acceptance tests.
- Explicitly replaced the historical `S8B3K6` Review path's dependency on bidirectional hooks with an independent control socket while leaving the hooks design untouched.

## Verification

- Checked the task and spec structure, required task sections, command set, parent Terminal association, notification idempotency, and explicit hooks isolation; all checks passed.
- Reviewed the proposal against the existing Review launch/report path and the overlapping `S8B3K6` / hooks bidirectional design; the new boundary and historical relationship are documented explicitly.
- No implementation tests were run because this task intentionally produces a design for user/agent Review only.

## Notes

- Design spec: [Agent-initiated Review orchestration](../specs/agent-review-orchestration/design.md).
- This design deliberately separates Review orchestration from `.sharkbay/specs/hooks-bidirectional-upgrade/`; existing read-only hooks remain unchanged.
- No implementation or commit is part of this task.
