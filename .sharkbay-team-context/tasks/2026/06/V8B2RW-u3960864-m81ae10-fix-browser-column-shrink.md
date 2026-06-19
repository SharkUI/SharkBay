---
kind: sharkbay_task
taskId: V8B2RW-u3960864-m81ae10
taskTag: V8B2RW
mode: quick
title: Fix browser column shrink
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019ee044-0cf7-7711-ac45-8583e27af6e7
branch: main
createdAt: 2026-06-19T14:27:19Z
updatedAt: 2026-06-19T14:49:25Z
completedAt: 2026-06-19T14:49:25Z
---

## Summary
Fixed the embedded browser layout so its content host can shrink with the available terminal column when the Projects sidebar is widened.

## Files
- .sharkbay/tasks/V8B2RW-u3960864-m81ae10-fix-browser-column-shrink.md
- src/renderer/App.tsx

## Work
- Related team context: B9R4K7-u3960864-m81ae10 and N5Q8V2-u3960864-m81ae10.
- Identified the browser-active dashboard grid as the likely source of a stale BrowserView width because the terminal column retained the terminal-specific minimum width.
- Split the terminal column minimum so browser-active layouts can shrink below the normal terminal minimum while terminal/editor layouts keep the existing 420px constraint.
- User screenshot clarified the remaining issue: the native BrowserView content bounds can remain at the old middle-column position while the React browser toolbar has already adapted to the new column.
- Added a browser layout key derived from dashboard column state so BrowserSurface recalculates native BrowserView bounds when the Projects column is resized, even if the host element's observed size does not change.
- Follow-up screenshot showed the BrowserView can still overrun the right edge at very narrow widths.
- User clarified the desired behavior is to align the middle column to the web content's minimum width instead of letting the column shrink below it.
- Replaced the too-small browser column minimum with a 952px browser-active minimum, preserving a 216px Projects column plus 12px resizer inside the app's 1180px minimum width.
- User requested the browser minimum width be 360px instead.
- Changed the browser-active middle column minimum to 360px.

## Verification
- `codegraph affected src/renderer/App.tsx`
- `npm run typecheck`
- `npm test -- tests/browser-tabs.test.ts tests/renderer-workflow.test.ts`
- `git diff --check -- src/renderer/App.tsx .sharkbay/tasks/V8B2RW-u3960864-m81ae10-fix-browser-column-shrink.md`
- Runtime Electron UI verification was not run because `npm run dev` starts long-running Vite, TypeScript watch, and Electron processes for this focused layout constraint change.

## Notes
- Keep the terminal tab minimum width unchanged for normal terminal use.
- No commit was produced.
