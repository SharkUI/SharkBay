---
kind: sharkbay_task
taskId: A5T8R2-u3960864-m81ae10
taskTag: A5T8R2
mode: task
title: Add agent-initiated Artifact discovery and launch
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 01a0ae8b-74cf-7132-97b0-3651af9b8f75
branch: main
createdAt: 2026-09-17T14:25:29Z
updatedAt: 2026-09-17T14:35:51Z
---

## Summary
Added discoverable agent-initiated Artifact generation alongside the existing Review workflow. A parent Agent can now launch an installed Agent with `.sharkbay/harness/artifact.sh start --task-id <task-id>`; SharkBay reserves and validates the HTML, attaches the generator as a background tab, opens the completed page, and notifies the parent Agent.

## Files
- src/main/harness.ts
- src/main/artifact-runs.ts
- src/main/review-control-server.ts
- src/main/terminal.ts
- src/shared/types.ts
- src/shared/ipc-channels.ts
- electron/ipc.ts
- electron/preload.mts
- src/renderer/types.ts
- src/renderer/App.tsx
- tests/harness.test.ts
- tests/artifact-runs.test.ts
- tests/review-control-server.test.ts
- tests/terminal-bootstrap.test.ts
- .sharkbay/tasks/A5T8R2-u3960864-m81ae10-agent-artifact-discovery.md

## Work
- Confirmed the gap: 0 of 12 installed project protocols document Artifact, although all include `open-artifact.sh`; Review is documented in 11 of 12 and the remaining project has an outdated Harness.
- Design claim: Artifact and Review are task capabilities with the same invocation grammar. Agents should discover both from the bootstrap/protocol and start either through a short Harness command; Artifact completion opens the page and notifies the parent Agent.
- Plan: extend the existing local control channel and task-session launch path; add managed `artifact.sh` plus protocol/bootstrap instructions; verify launch, completion/open notification, older-Harness update detection, and all supported prompt injection paths.
- Implementation boundary: keep the current GUI Create Artifact flow intact. Agent-initiated Artifact uses a small dedicated run manager and the existing local control socket; its explicit completion command validates the reserved HTML before opening it and notifying the parent terminal.
- Added `ArtifactRunManager` for parent/session validation, agent selection, reserved output paths, secure completion, failure cleanup, browser opening, and retrying parent notifications when an input draft is pending.
- Added managed `artifact.sh`, protocol documentation, and a short bootstrap discovery sentence. Existing Harness installations are reported as stale until the user runs Update Harness; the current project Harness was updated locally.
- Added the main/preload/renderer event that attaches an agent-initiated Artifact terminal to the matching project in the background. Kept the existing GUI Create Artifact flow and `open-artifact.sh` fallback unchanged.
- Rechecked Review while running the full suite: its protocol command, control path, lifecycle manager, background tab events, delayed prompt injection, and notification tests remain passing.

## Verification
- `npm run typecheck` — passed.
- `npm test` — passed: 62 test files, 367 tests.
- `npm run build` — passed; Electron TypeScript and the production renderer bundle built successfully.
- `git diff --check` — passed.
- Updated the current project's Harness and verified executable `.sharkbay/harness/artifact.sh` plus both `Agent-Initiated Artifact` and `Agent-Initiated Review` sections in `.sharkbay/harness/protocol.md`.
- Commit: `431d4fae` (`feat: add agent-initiated artifacts`).

## Notes
- Keep `.sharkbay/team-context/` read-only. Do not modify other projects while implementing; their Harness files will update only when the user invokes Update Harness.
