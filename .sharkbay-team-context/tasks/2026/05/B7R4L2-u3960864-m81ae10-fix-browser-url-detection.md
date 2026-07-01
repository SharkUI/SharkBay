---
kind: sharkbay_task
taskId: B7R4L2-u3960864-m81ae10
taskTag: B7R4L2
mode: quick
title: Fix browser URL detection
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.5
sessionId: 019e35fd-dd20-76a1-bcf4-d5a7edf86bdd
createdAt: 2026-05-17T12:52:45Z
updatedAt: 2026-07-01T14:25:45Z
completedAt: 2026-05-17T12:59:17Z
commit: 3d1fc863
---

## Summary
Fixed browser button service URL detection so streamed terminal output like Vite's `http://localhost:7777/` keeps the port.

## Files
- src/renderer/workflow.ts
- src/renderer/App.tsx
- tests/renderer-workflow.test.ts

## Work
- Started investigation of embedded browser URL detection from terminal service output.
- Related team context reviewed: `3YGNE7-u3960864-m81ae10`, `K7S4N2-u3960864-m81ae10`.
- Planned fix: accumulate short service-output buffers per terminal session before extracting URLs.
- Added conservative URL matching so a trailing `http://localhost` fragment is not treated as a complete service URL before the port arrives.
- Reopened after user reported the issue persists; next focus is ANSI style sequences embedded inside Vite URLs.
- Changed terminal control sequence stripping to remove zero-width ANSI/OSC codes so styled URLs like `http://localhost:<bold>7777</bold>/` stay contiguous.

## Verification
- `npm test -- tests/renderer-workflow.test.ts tests/browser-tabs.test.ts`
- `npm run typecheck`
- `npm test`

## Notes
- User reported Vite terminal output with `Local: http://localhost:7777/` being detected as `http://localhost/`.
