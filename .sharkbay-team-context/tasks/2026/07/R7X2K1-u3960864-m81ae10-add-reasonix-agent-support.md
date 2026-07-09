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
updatedAt: 2026-07-09T11:59:52Z
completedAt: 2026-07-09T11:59:52Z
---

## Summary
Added Reasonix (esengine/DeepSeek-Reasonix) as a fully-supported agent in SharkBay: CLI detection, install recipe, session restore, hook-based status monitoring connector, and SVG icon. TypeScript compilation passes cleanly.

## Files
- src/main/agent-clis.ts
- src/renderer/App.tsx
- src/plugins/bundled/agent-detector.ts
- src/shared/agent-session-restore.ts
- src/main/hooks/connectors/reasonix.ts

## Work
- Added reasonix to agent CLI definitions (id="reasonix", commands=["reasonix"], shortLabel="Rx")
- Added reasonix to renderer UI: allAgentCliDefinitions, hookSupportedAgents, agentLaunchOptions
- Added ReasonixIcon (16px monochrome) and ReasonixLogoColorIcon (color gradient) SVG components
- Updated AgentCliIcon and AgentLogoIcon mappings to include reasonix
- Added reasonix to agent-detector plugin: detection via `which reasonix`, npm install recipe
- Added reasonix to session-restore: type, definition (match: /\breasonix\b/), --resume command
- Created ReasonixConnector: maps PreToolUse→tool_start, PostToolUse→tool_end, PermissionRequest→attention, UserPromptSubmit→prompt, Stop→turn_end; writes to ~/.reasonix/settings.json

## Verification
- TypeScript compilation: `npm run typecheck` passes with zero errors (tsconfig.renderer.json + tsconfig.node.json)

## Notes
- Reasonix has no native `--yolo` CLI flag; YOLO-equivalent achieved via `[permissions] mode = "allow"` in reasonix.toml
- Hook payload format inferred from Reasonix docs; may need refinement after testing with actual Reasonix
- Reasonix hooks configured via `~/.reasonix/settings.json` (global, always active)
- Connector follows the same AgentConnector pattern as KiroConnector, GeminiConnector, etc.
- The Reasonix icon is a rounded rectangle (rx=5) with a stylized "R" letterform in negative space
