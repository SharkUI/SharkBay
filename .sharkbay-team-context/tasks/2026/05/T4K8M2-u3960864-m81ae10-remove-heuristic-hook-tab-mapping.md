---
kind: sharkbay_task
taskId: T4K8M2-u3960864-m81ae10
taskTag: T4K8M2
mode: task
title: Remove heuristic hook-to-tab mapping in renderer
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: f8e84f7d-3967-418e-8e64-7cacc8cbcc9e
branch: main
createdAt: 2026-05-30T14:59:39Z
updatedAt: 2026-05-30T14:59:39Z
---

## Summary
Remove the fallback heuristic in renderer that guesses session→tab mappings, keeping only server-resolved PID-based mappings.

## Files
- src/renderer/App.tsx

## Work
- After SharkBay restarts (e.g. due to pkill), terminalPidToId is empty and PID resolution fails. The renderer heuristic then wrongly maps sessions to tabs by createdAt order, causing working/idle to show on wrong tabs.
- Fix: only use server-provided terminalSessionId, remove the createdAt-based heuristic.

## Verification
- pending

## Notes
- The heuristic was added as fallback before PID-based resolution existed (V7K3P9). Now that PID resolution works, the heuristic causes more harm than good after restarts.
