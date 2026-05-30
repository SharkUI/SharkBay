---
kind: sharkbay_task
taskId: N3K7V2-u3960864-m81ae10
taskTag: N3K7V2
mode: task
title: Fix agent terminal tab status indicator
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 9b2d2f8b-3f14-42d5-9e9b-7f720b8daaf6
branch: main
createdAt: 2026-05-30T06:40:14Z
updatedAt: 2026-05-30T06:43:15Z
completedAt: 2026-05-30T06:43:15Z
commits:
  - 52ae55f2
---

## Summary
Restore the per-tab traffic light dot on agent terminal tabs by wiring hook-based project activity state to the tab indicator.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Commit 24118d98 (V9H3K2) removed terminal-output-burst based activity, which also removed the per-tab dot's working/attention states.
- Hook state (`hookActivityByProjectId`) drives the project list pill but was never wired to the per-tab dot.
- Fix: pass `hookActivityByProjectId` into TerminalPane, resolve per-space activity, apply `is-working`/`is-attention` classes to agent tab dots.
- Re-add CSS for `.terminal-state.is-working` and `.terminal-state.is-attention` (all themes).

## Verification
- `npm run typecheck` passes.
- `npm test` passes: 39 files, 146 tests.
- `npm test -- tests/renderer-workflow.test.ts` passes: 8 tests.

## Notes
- Related: V9H3K2-u3960864-m81ae10, H7K9P2-u3960864-m81ae10, K2W8R4-u3960864-m81ae10
