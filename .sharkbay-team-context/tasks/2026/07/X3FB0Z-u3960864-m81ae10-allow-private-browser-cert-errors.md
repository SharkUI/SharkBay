---
kind: sharkbay_task
taskId: X3FB0Z-u3960864-m81ae10
taskTag: X3FB0Z
mode: quick
title: Allow private browser cert errors
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f1e26-812d-7c32-818e-6d0b35ec8fe5
branch: main
createdAt: 2026-07-01T15:01:02Z
updatedAt: 2026-07-02T02:02:16Z
completedAt: 2026-07-01T15:03:04Z
commits:
  - 9a7fd04b
---

## Summary
Built-in BrowserView pages on private/local HTTPS hosts can now continue past certificate errors, while public hosts and non-browser webContents keep normal certificate rejection.

## Files
- .sharkbay/tasks/X3FB0Z-u3960864-m81ae10-allow-private-browser-cert-errors.md
- electron/ipc.ts
- electron/main.ts
- src/main/browser-tabs.ts
- tests/browser-tabs.test.ts

## Work
- Started task to allow built-in browser access to private/local HTTPS services with certificate errors.
- Assumption: only embedded BrowserView pages on private/local hosts should bypass certificate errors; main app and public hosts should keep normal TLS checks.
- Added a BrowserManager certificate-error policy that only allows managed BrowserView webContents on local/private HTTPS hosts.
- Wired Electron's certificate-error event through that policy and added unit coverage for private/local allow cases and public-host denial.

## Verification
- `npm test -- browser-tabs`
- `npm run typecheck`
- `codegraph affected src/main/browser-tabs.ts electron/ipc.ts electron/main.ts tests/browser-tabs.test.ts`
- `npm test`

## Notes
- Searched team context for certificate/private network/browser history before editing; no exact prior task was found.
