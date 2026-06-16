---
kind: sharkbay_task
taskId: K9YOLO-u3960864-m81ae10
taskTag: K9YOLO
mode: quick
title: Replace Codex Skip approval toggle with YOLO mode
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: e4c4c2c5-c535-4b9c-83af-9e88623923b7
branch: main
createdAt: 2026-06-16T01:34:12Z
updatedAt: 2026-06-16T01:35:26Z
completedAt: 2026-06-16T01:34:41Z
commits:
  - 47525474
---

## Summary
Replace Codex CLI's "Skip approval" launch toggle (`--ask-for-approval never`) with a "YOLO mode" toggle (`--yolo`) in the Agent CLIs settings panel, and update the description text.

## Files
- src/renderer/App.tsx

## Work
- Reason for change: `--ask-for-approval never` only stops approval prompts; the Codex sandbox still restricts commands, so it feels heavily limited. `--yolo` (alias for `--dangerously-bypass-approvals-and-sandbox`) disables both approval and sandbox.
- Replace the `codex` entry in `agentLaunchOptions`: flag `--ask-for-approval never` -> `--yolo`, label "Skip approval" -> "YOLO mode", description updated with isolated-environment warning.

## Verification
- `npm run typecheck` passed (tsc renderer + node, exit 0).

## Notes
- Launch options are wired end-to-end (team task W5K9L2): toggles persist to localStorage key `sharkbay:agent-launch-flags:<agentId>` and the flag string is injected into the launch command, so changing the flag string changes the actual command.
- tests/agent-session-restore.test.ts uses `--ask-for-approval never` only as a generic launchFlags fixture; it is independent of agentLaunchOptions and left untouched.
- Related prior tasks: T3J8R5 (defined agentLaunchOptions), W5K9L2 (wired options to launch command), CQOXIE / M7Q2LA (other per-agent flag tweaks).
