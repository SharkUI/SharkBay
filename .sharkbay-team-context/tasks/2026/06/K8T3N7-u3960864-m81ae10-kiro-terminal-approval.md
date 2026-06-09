---
kind: sharkbay_task
taskId: K8T3N7-u3960864-m81ae10
taskTag: K8T3N7
mode: task
title: Detect Kiro approval state from terminal output
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: cc80f08f-4831-408a-8235-0972b9a3fab6
branch: feat/kiro-terminal-approval
createdAt: 2026-06-09T01:33:48Z
updatedAt: 2026-06-09T01:38:11Z
completedAt: 2026-06-09T01:38:11Z
---

## Summary
Detect Kiro's permission approval prompt from terminal output and inject a synthetic attention event into the state manager, giving Kiro sessions a red (approval) indicator.

## Files
- (TBD)

## Work
- Kiro connector has no "attention" event in its hook protocol
- Terminal output contains `ESC to close | Enter to see more options` as reliable signal
- Hook events (tool_start, turn_end) will naturally override the state when approval completes

## Verification
- (TBD)

## Notes
- Related to R7K4M9 (state rename). Prior task D1GSIG investigated kiro attention status.
- Terminal data arrives in chunks; need buffer/window for pattern matching.
