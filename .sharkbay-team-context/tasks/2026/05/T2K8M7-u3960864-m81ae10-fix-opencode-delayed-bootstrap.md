---
kind: sharkbay_task
taskId: T2K8M7-u3960864-m81ae10
taskTag: T2K8M7
mode: quick
title: Fix opencode launch to use delayedBootstrapPrompt
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: f6c613a6-5822-41d0-b4e1-61b67036f490
branch: main
createdAt: 2026-05-24T03:55:00Z
updatedAt: 2026-05-24T03:57:00Z
completedAt: 2026-05-24T03:57:00Z
commit: 2dc23e3d
---

## Summary
Switch opencode from --prompt arg to delayedBootstrapPrompt mechanism (same as deepseek) to avoid TUI freeze on startup.

## Files
- src/main/teamwork-harness.ts
- src/main/terminal.ts
- tests/teamwork-harness.test.ts
- vite.config.ts

## Work
- Changed `teamworkBootstrapArgs("opencode")` to return `[]` (bare command, no --prompt).
- Added `"opencode"` to the delayedBootstrapPrompt condition in terminal.ts alongside deepseek.
- Updated test assertion to expect bare `"opencode"` command without --prompt args.
- Diagnosed persistent black screen in packaged app: esbuild minification corrupts xterm.js `requestMode` (const enum scope issue). opencode TUI sends DECRQM queries which trigger the crash.
- Disabled renderer minification in vite.config.ts (Electron app, no network delivery benefit).

## Verification
- `npm run typecheck`: clean.
- `npm test`: 37 files, 119 tests passed.
- Packaged app (`npm run build && npm run pack`) launches opencode TUI successfully.

## Notes
- Root cause of black screen: esbuild minification breaks xterm.js internal const enum in requestMode(). Not an IPC or pending buffer issue.
- delayedBootstrapPrompt fix (same pattern as 3XDEPR/deepseek) is also needed but was masked by the minification crash.
- L4V8N3's pending output buffer was never verified in packaged app — the xterm crash was the real blocker all along.
- Previous tasks (Q24IBU, H7Q2VB, L4V8N3) addressed real IPC issues but this specific crash was unrelated.
