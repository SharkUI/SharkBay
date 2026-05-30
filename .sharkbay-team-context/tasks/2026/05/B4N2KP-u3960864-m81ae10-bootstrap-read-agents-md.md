---
kind: sharkbay_task
taskId: B4N2KP-u3960864-m81ae10
taskTag: B4N2KP
mode: task
title: Bootstrap prompt directs agents to read AGENTS.md
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.8
sessionId: a61b2a4f-3854-4f93-aa58-32201471f529
branch: main
createdAt: 2026-05-30T14:07:53Z
updatedAt: 2026-05-30T14:09:12Z
completedAt: 2026-05-30T14:09:12Z
---

## Summary
Appended a directive to the bootstrap prompt so every supported agent is told to also read `AGENTS.md` (if present), giving team-owned conventions unified multi-agent reach without SharkBay writing to that file.

## Files
- src/main/harness.ts
- tests/harness.test.ts

## Work
- Bootstrap is SharkBay's only channel that reaches all agents uniformly; native entry files (CLAUDE.md/GEMINI.md/QWEN.md/.kiro) are fragmented, so team conventions placed only in AGENTS.md don't reliably reach Gemini/Qwen/Kiro.
- Added the directive as the final element of `BOOTSTRAP_TASK_PROMPT` in harness.ts: "If `AGENTS.md` exists at the project root, also read it and follow its team conventions." SharkBay still never creates or modifies AGENTS.md.
- Updated the `bootstrapPrompt({ codeGraphEnabled: true })` expectation in tests/harness.test.ts to match.

## Verification
- `npm run typecheck` passes.
- `npm test` (vitest run) — 157/157 tests pass across 40 files, including harness.test.ts (17).
- `npm run build` succeeds.

## Notes
- Keeps the established design: AGENTS.md is user-owned/team-shared; SharkBay only points agents to it via bootstrap, never injects into it (consistent with removeHarnessEntryBlock migration away from writing entry blocks).
- No commit produced in this task; not staged/committed per protocol (commits only on explicit request).
