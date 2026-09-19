---
kind: sharkbay_task
taskId: K5N7R3-u3960864-m81ae10
taskTag: K5N7R3
mode: task
title: Persist GitHub-native product principles
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 01a0afc3-14f9-7683-9a6d-5be79a6cef9a
branch: main
createdAt: 2026-09-19T06:56:12Z
updatedAt: 2026-09-19T06:56:39Z
completedAt: 2026-09-19T06:56:39Z
---

## Summary
Persist SharkBay's GitHub-native product boundaries in the root AGENTS.md so future agent sessions do not reintroduce accounts, permissions, or duplicated GitHub collaboration systems.

## Files
- .sharkbay/tasks/K5N7R3-u3960864-m81ae10-persist-github-native-principles.md
- AGENTS.md

## Work
- Confirmed the requested principles belong in the root AGENTS.md and will be added without changing existing instructions.
- Added a dedicated project-context section covering GitHub-owned identity, permissions, Issues, pull requests, reviews, sources of truth, and reconstructible state.

## Verification
- Confirmed the existing AGENTS.md instructions remain unchanged and the new principles are appended as a separate section.
- Ran `git diff --check` successfully for AGENTS.md and the SharkBay task record.
