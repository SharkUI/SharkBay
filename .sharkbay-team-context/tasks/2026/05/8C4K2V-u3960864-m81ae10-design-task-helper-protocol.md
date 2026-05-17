---
kind: sharkbay_task
taskId: 8C4K2V-u3960864-m81ae10
taskTag: 8C4K2V
mode: task
title: Design task helper protocol
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: codex
agentVersion: codex-cli 0.130.0
createdAt: 2026-05-17T04:52:51Z
updatedAt: 2026-05-17T04:55:41Z
completedAt: 2026-05-17T04:55:41Z
---

## Summary
Draft a revised SharkBay Teamwork protocol template that uses a low-intrusion task helper to create and update task files while recording per-task agent id and version.

## Files
- docs/teamwork-protocol-helper.md

## Work
- Checked existing team context and docs for overlapping protocol/helper design.
- Documented a helper-first protocol shape without treating AGENTS.md or the project as agent-specific.

## Verification
- `node -e '...'` checked Markdown fence balance for docs/teamwork-protocol-helper.md.
- Reviewed docs/teamwork-protocol-helper.md with `sed`.

## Notes
- Existing dirty change in src/renderer/App.tsx was present before this task and is intentionally untouched.
