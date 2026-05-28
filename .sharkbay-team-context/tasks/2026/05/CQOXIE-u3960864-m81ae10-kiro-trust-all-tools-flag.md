---
kind: sharkbay_task
taskId: CQOXIE-u3960864-m81ae10
taskTag: CQOXIE
mode: quick
title: Add --trust-all-tools launch option for Kiro CLI
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: ab0be1f2-d7ab-4689-a71a-6e309e12cff5
branch: main
createdAt: 2026-05-28T08:00:57Z
updatedAt: 2026-05-28T08:08:35Z
completedAt: 2026-05-28T08:08:35Z
---

## Summary

Add `--trust-all-tools` as a toggleable launch option for Kiro CLI in the Agent CLIs settings panel, matching the pattern used by Codex/Claude/Gemini/DeepSeek.

## Files

- src/renderer/App.tsx

## Work

- Investigated existing `agentLaunchOptions` pattern in `src/renderer/App.tsx:2927`
- Kiro entry is currently `kiro: []` — needs one option added
- Flag: `--trust-all-tools`, label: "Trust all tools", description: "Allows the model to use any tool to run commands without asking for confirmation"

## Verification

- `npm run typecheck` passed (renderer + node configs)

## Notes

- The change is a single-line addition to the `agentLaunchOptions` record at line ~2937 in App.tsx
- UI rendering is already handled by `AgentCliDetailInstalled` component — no UI changes needed
- Flags are persisted in localStorage under `sharkbay:agent-launch-flags:kiro`
