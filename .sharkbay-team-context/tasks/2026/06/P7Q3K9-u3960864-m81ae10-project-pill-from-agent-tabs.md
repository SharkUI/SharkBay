---
kind: sharkbay_task
taskId: P7Q3K9-u3960864-m81ae10
taskTag: P7Q3K9
mode: task
title: Compute project status pill from SharkBay agent tabs
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: cbd03be5-7acd-4af6-beb2-5257951c4636
branch: main
createdAt: 2026-06-06T10:29:56Z
updatedAt: 2026-06-06T10:37:19Z
completedAt: 2026-06-06T10:37:19Z
---

## Summary
Project status pill now derives solely from the project's own SharkBay agent tab
light states (attention > idle > working > null), so pill color always matches the
tab lights. Focusing a tab clears both idle AND attention (was idle only), and the
pill recomputes. Added a clarifying note to V3K8P2 about the canonical ordering.

## Files
- src/renderer/App.tsx
- .sharkbay/tasks/V3K8P2-u3960864-m81ae10-fix-idle-overrides-working.md

## Work
- Confirmed canonical ordering attention > idle > working > null. `priorityOf`
  already matched; V3K8P2 (working > idle) was wrong and never committed.
- Added `agentTabLightState()` as the single source of truth for both tab lights
  and the pill; active tab never contributes idle/attention.
- Replaced the App-level session aggregation with a TerminalPane effect that
  aggregates per-project from `spaces` + `hookStateByTerminalId`, reported up via
  new `onProjectActivityChange` prop (guarded by `sameActivityMap`).
- Sessions not running in a SharkBay tab are naturally excluded (no terminalId →
  not in hookStateByTerminalId), superseding V8KR2T's orphan-skip workaround.
- Focus clear (setActiveTab + active-tab effect) now covers idle and attention.

## Verification
- `npm run typecheck` — clean (renderer + node)
- `npm test` — 158/158 passed (40 files)

## Notes
- Related prior tasks: R2K4V7 (correct ordering), V3K8P2 (wrong/abandoned),
  V8KR2T (orphaned session skip — now superseded by tab-based aggregation).
- Tab light state (`hookStateByTerminalId` via `agentTabLightState`) is the single
  source of truth driving both tab lights and the project pill.
- No commit produced; user has not requested one.
