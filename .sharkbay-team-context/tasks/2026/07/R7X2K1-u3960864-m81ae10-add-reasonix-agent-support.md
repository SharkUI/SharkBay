---
kind: sharkbay_task
taskId: R7X2K1-u3960864-m81ae10
taskTag: R7X2K1
mode: task
title: Add Reasonix agent support
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
branch: feature/reasonix-agent-support
createdAt: 2026-07-09T11:51:08Z
updatedAt: 2026-07-09T12:28:15Z
completedAt: 2026-07-09T12:28:15Z
commits: []
---

## Summary
Completed Reasonix support across CLI detection, install recipe, UI mapping, hook registration, status normalization, launch/session tracking, restore handling, and tests. Handoff review fixed remaining gaps around current Reasonix hook payload fields, missing session ids, and invalid `reasonix <prompt>` launch arguments.

## Files
- src/main/agent-clis.ts
- src/main/harness.ts
- src/renderer/App.tsx
- src/plugins/bundled/agent-detector.ts
- src/shared/agent-session-restore.ts
- tests/agent-session-restore.test.ts
- src/main/hooks/connectors/reasonix.ts
- src/main/hooks/bridge.ts
- src/main/terminal.ts
- electron/ipc.ts
- tests/hooks-connectors.test.ts
- tests/harness.test.ts

## Work
- Added reasonix to agent CLI definitions (id="reasonix", commands=["reasonix"], shortLabel="Rx")
- Added reasonix to renderer UI: allAgentCliDefinitions, hookSupportedAgents, agentLaunchOptions
- Added ReasonixIcon (16px monochrome) and ReasonixLogoColorIcon (color gradient) SVG components
- Updated AgentCliIcon and AgentLogoIcon mappings to include reasonix
- Added reasonix to agent-detector plugin: detection via `which reasonix`, npm install recipe
- Added reasonix to session-restore: type, definition, --resume command
- Created ReasonixConnector: maps PreToolUse→tool_start, PostToolUse→tool_end, PermissionRequest→attention, UserPromptSubmit→prompt, Stop→turn_end
- Fixed bootstrap injection: added reasonix to agentBootstrapArgs, withLaunchSessionId, and agent-session-id.sh
- Fixed hook wiring: imported and registered ReasonixConnector in electron/ipc.ts
- Reopened for handoff review because the local task was marked completed while related project changes were still uncommitted and `src/main/hooks/connectors/reasonix.ts` was untracked.
- Reviewed upstream Reasonix hook docs/source and found remaining gaps: Reasonix payload uses `event`, `toolName`, `toolArgs`, and lacks a native session id, while `reasonix <prompt>` is an invalid launch form.
- Added targeted tests for Reasonix connector normalization/config, hook CLI session id propagation, and Reasonix launch bootstrap command arguments.
- Adjusted Reasonix restore command to use the supported interactive `--resume` picker instead of passing SharkBay's external session id as an unsupported positional argument.

## Verification
- TypeScript compilation: `npm run typecheck` passes with zero errors
- CodeGraph impact check: `codegraph affected src/main/hooks/connectors/reasonix.ts src/main/hooks/bridge.ts src/main/harness.ts src/main/terminal.ts src/shared/agent-session-restore.ts tests/hooks-connectors.test.ts tests/harness.test.ts tests/agent-session-restore.test.ts` reported `tests/agent-session-restore.test.ts`, `tests/harness.test.ts`, and `tests/hooks-connectors.test.ts`.
- Focused tests: `npm test -- tests/hooks-connectors.test.ts tests/harness.test.ts tests/agent-session-restore.test.ts` passed 34 tests across 3 files.
- TypeScript compilation: `npm run typecheck` passed.
- Whitespace check: `git diff --check` passed.

## Notes
- Reasonix has no native `--yolo` CLI flag; YOLO-equivalent via `[permissions] mode = "allow"` in reasonix.toml
- Hook payload format was checked against upstream Reasonix docs/source from `esengine/DeepSeek-Reasonix` main-v2 at `5ad8a5e`.
- ReasonixConnector writes hooks to `~/.reasonix/settings.json` (global, always active)
- SHARKBAY_SESSION_ID env var injected at launch for session tracking
- Reasonix hook payloads do not expose the native session file/path; SharkBay injects an external session id for tracking, and restore uses Reasonix's interactive `--resume` picker rather than an exact path restore.
- No commit was produced for this task.
