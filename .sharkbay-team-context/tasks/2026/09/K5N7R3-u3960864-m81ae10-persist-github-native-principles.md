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
updatedAt: 2026-09-19T06:59:22Z
completedAt: 2026-09-19T06:59:22Z
---

## Summary
Persist SharkBay's product positioning and GitHub-native boundaries in the root AGENTS.md so future agent sessions preserve the intended product scope.

## Files
- .sharkbay/tasks/K5N7R3-u3960864-m81ae10-persist-github-native-principles.md
- AGENTS.md

## Work
- Confirmed the requested principles belong in the root AGENTS.md and will be added without changing existing instructions.
- Added a dedicated project-context section covering GitHub-owned identity, permissions, Issues, pull requests, reviews, sources of truth, and reconstructible state.
- Reopened to add the explicit product positioning requested by the user.
- Added the positioning that SharkBay coordinates GitHub Issues and pull requests with isolated local worktree lifecycles for individuals and small teams using multiple coding-agent CLIs, without becoming a separate team SaaS, issue tracker, or agent platform.

## Verification
- Confirmed the existing AGENTS.md instructions remain unchanged and the new principles are appended as a separate section.
- Ran `git diff --check` successfully for AGENTS.md and the SharkBay task record.
- Confirmed the positioning explicitly names the target users, GitHub-native coordination model, worktree lifecycle, and excluded product categories.
