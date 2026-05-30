---
kind: sharkbay_task
taskId: R8V3N6-u3960864-m81ae10
taskTag: R8V3N6
mode: task
title: Fix input bar resize triggering terminal redraw
status: completed
completedAt: 2026-05-30T14:43:23Z
commits:
  - 724fdb86
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: 5626f84a-135c-42bb-8c98-fdcaa16b22a9
branch: main
createdAt: 2026-05-30T14:35:00Z
updatedAt: 2026-05-30T14:43:23Z
---

## Summary
When the prompt input textarea grows from 1 to 2+ lines, it no longer causes terminal resize/redraw. The input bar now overlays the terminal bottom instead of consuming grid space.

## Files
- src/styles/app.css

## Work
- Changed `.terminal-layout` from 3-row grid (`auto 1fr auto`) to 2-row grid (`auto 1fr`); added `position: relative`
- Made `.prompt-input-bar` absolutely positioned at the bottom of terminal-layout with `z-index: 2`
- Changed `.xterm-surface` inset from `0` to `0 0 41px 0` so terminal content ends above the input bar; removed bottom padding
- Changed `.prompt-input-bar.is-disabled` from `opacity: 0.5` to `display: none` since overlaying browser/editor tabs is unnecessary

## Verification
- Build passes (`npm run build`)
- xterm-surface bottom is set by `inset` not padding, so FitAddon calculates rows based on actual visible height — no content hidden behind input bar
- When textarea grows (Shift+Enter), extra height overlays terminal; after sending (Enter), resets to 1 row

## Notes
- Related to W2R6K8 which originally introduced the PromptInputBar
- The 41px bottom inset = 6+6 padding + 28 textarea + 1 border-top
- When textarea grows beyond 1 line, extra height temporarily covers terminal — acceptable per user requirement
