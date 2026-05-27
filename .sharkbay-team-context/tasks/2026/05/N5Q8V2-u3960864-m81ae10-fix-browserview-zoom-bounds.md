---
kind: sharkbay_task
taskId: N5Q8V2-u3960864-m81ae10
taskTag: N5Q8V2
mode: quick
title: Fix BrowserView zoom bounds
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e6875-e82e-7be2-82bf-6730faea76dc
branch: main
createdAt: 2026-05-27T15:34:22Z
updatedAt: 2026-05-27T15:39:23Z
completedAt: 2026-05-27T15:39:23Z
---

## Summary
Fixed embedded BrowserView bounds when the SharkBay renderer is zoomed by scaling BrowserView coordinates with the owning window zoom factor before calling `setBounds`.

## Files
- .sharkbay/tasks/N5Q8V2-u3960864-m81ae10-fix-browserview-zoom-bounds.md
- src/main/browser-tabs.ts
- tests/browser-tabs.test.ts

## Work
- Reproduced the issue by loading `https://example.com` in a browser tab with a non-100% renderer zoom: BrowserView content shifted left/up and rendered too small.
- Confirmed `Cmd+0` immediately corrected the BrowserView placement, pointing to CSS-pixel bounds being passed directly to native BrowserView bounds.
- Related context: F4C8R2-u3960864-m81ae10, K7S4N2-u3960864-m81ae10, and the abandoned local task B9R4K7-u3960864-m81ae10.
- Scaled BrowserView bounds by the owning window renderer zoom factor before calling `BrowserView.setBounds`.
- Added focused unit coverage for BrowserView bounds scaling.

## Verification
- `codegraph affected src/main/browser-tabs.ts tests/browser-tabs.test.ts`
- `npm run typecheck`
- `npm test -- tests/browser-tabs.test.ts tests/renderer-workflow.test.ts`
- `git diff --check -- src/main/browser-tabs.ts tests/browser-tabs.test.ts .sharkbay/tasks/N5Q8V2-u3960864-m81ae10-fix-browserview-zoom-bounds.md`
- `npm run build`
- Runtime diagnosis before the fix: loading `https://example.com` reproduced the offset; `Cmd+0` reset corrected placement immediately, confirming a zoom/bounds coordinate mismatch.
- Runtime verification after the fix was not completed because starting a fresh Vite dev server began failing with `listen EPERM` on local ports.

## Notes
- Preserve the intentional design where browser tabs hide the detail column.
