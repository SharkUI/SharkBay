---
kind: sharkbay_task
taskId: K4R8V2-u3960864-m81ae10
taskTag: K4R8V2
mode: task
title: Remove legacy harness entry block code
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 2fa4f366-ae53-4d3b-8daa-0b06ee75a30a
branch: main
createdAt: 2026-06-02T10:59:36Z
updatedAt: 2026-06-02T11:04:03Z
completedAt: 2026-06-02T11:04:03Z
commits:
  - f8e21acf
---

## Summary
Removed dead code from harness.ts: constants (ROOT_ADAPTER_FILES, KIRO_STEERING_FILE, HARNESS_ENTRY_START, HARNESS_ENTRY_END), functions (removeManagedEntryBlock, removeHarnessEntryBlock, joinEntryParts), and the uninstall loop that cleaned legacy entry blocks from adapter files.

## Files
- src/main/harness.ts
- tests/harness.test.ts

## Work
- Removed 4 constants: ROOT_ADAPTER_FILES, KIRO_STEERING_FILE, HARNESS_ENTRY_START, HARNESS_ENTRY_END.
- Removed 3 functions: removeManagedEntryBlock, removeHarnessEntryBlock, joinEntryParts.
- Simplified uninstallHarness to only restore exclude and remove .sharkbay directory.
- Removed the test "removes only the harness block from user-owned entry files during uninstall".

## Verification
- `npm run build` passes.
- 16 harness tests pass, 3 project-files tests pass.

## Notes
- The ProtocolUninstallResult type shape was kept unchanged (removedPaths/skippedPaths/excludeRemovedLines) to avoid touching renderer/shared type definitions.
- uninstallHarness still returns removedPaths/skippedPaths but now only for the .sharkbay directory itself.
