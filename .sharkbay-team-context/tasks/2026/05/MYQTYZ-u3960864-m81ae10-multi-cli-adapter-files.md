---
kind: sharkbay_task
taskId: MYQTYZ-u3960864-m81ae10
taskTag: MYQTYZ
mode: task
title: Generate multi-CLI adapter entry files on Teamwork install
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: kiro
createdAt: 2026-05-17T03:11:00Z
updatedAt: 2026-05-17T03:14:46Z
completedAt: 2026-05-17T03:14:46Z
commit: b3801d34
---

## Summary

Extended Teamwork install to generate adapter entry files for all major AI CLI tools (CLAUDE.md, GEMINI.md, QWEN.md, .kiro/steering/sharkbay-protocol.md) in addition to the existing AGENTS.md, and clean them up on uninstall.

## Files
- src/main/teamwork-harness.ts
- tests/teamwork-harness.test.ts

## Work
- Moved CLAUDE.md and GEMINI.md from LEGACY_ROOT_ADAPTER_FILES to ROOT_ADAPTER_FILES.
- Added QWEN.md to ROOT_ADAPTER_FILES.
- Added KIRO_STEERING_FILE constant for .kiro/steering/sharkbay-protocol.md.
- Install now creates .kiro/steering/ directory and writes the steering file.
- Uninstall now removes the Kiro steering file.
- Conflict check covers all new files including the Kiro steering path.
- .git/info/exclude entries updated to include all new adapter files.
- Updated all affected tests to match new behavior.

## Verification
- npm run typecheck: passed
- npx vitest run: 56 tests across 16 files, all passed, no regressions.

## Notes
- CLAUDE.md/GEMINI.md were previously treated as legacy (deleted on install). Now they are actively generated.
- The .kiro/steering/ path is project-level, not global (~/.kiro/steering/).
- All generated files use the same sharkbay-generated marker for safe overwrite/removal.
