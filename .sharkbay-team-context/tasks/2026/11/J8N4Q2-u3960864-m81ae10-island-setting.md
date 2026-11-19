---
kind: sharkbay_task
taskId: J8N4Q2-u3960864-m81ae10
taskTag: J8N4Q2
mode: task
title: Add General Island setting
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1f1b9-cff7-79b3-bd11-f8a8034afd25
branch: main
createdAt: 2026-11-18T15:08:39Z
updatedAt: 2026-11-19T02:57:29Z
completedAt: 2026-11-19T02:57:29Z
---

## Summary
Added a persisted desktop General setting that immediately enables or disables the Island notification area, defaults on, and preserves independent sound preferences. Completed typecheck, regression/integration tests, build, and isolated desktop/WebUI checks after resuming the interrupted session.

## Files
- electron/ipc.ts
- electron/main.ts
- electron/preload.mts
- src/main/config.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/runtime/application-runtime.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- tests/config-migration.test.ts
- tests/ipc-channels.test.ts
- tests/web-runtime-integration.test.ts
- .sharkbay/tasks/J8N4Q2-u3960864-m81ae10-island-setting.md

## Work
- Read team tasks N5S8QA-u3960864-m81ae10, V9K3R7-u3960864-m81ae10, I3D7K9-u3960864-m81ae10, and C7F2N9-u3960864-m81ae10.
- Assumption: default enabled to preserve existing behavior; changes apply immediately and survive restart.
- Plan: trace settings persistence and Island lifecycle; add the existing General checkbox pattern; verify persistence, visibility, typecheck, and rendered UI.

- Added desktop-only persisted Island enablement, immediate window visibility control, and the General checkbox above Sounds. WebUI omits this desktop capability.
- Reuse the existing Island window when disabled to avoid accumulating lifecycle IPC listeners; preserve independent sound settings.
- Resumed after the previous session ended. Re-read the four related team records and inspected the existing Island changes; retain unrelated TasksDetailTab project-switch changes and tests untouched.
- Remaining plan: finish typecheck and targeted runtime tests, build, inspect the rendered General setting and Island visibility/persistence, then fill final verification and summary. No commit requested.
- Completed remaining verification without additional source changes. Confirmed the existing General checkbox pattern and placement above Sounds in actual Electron rendering; WebUI omits the desktop-only control.
- Used temporary isolated Electron/runtime profiles for UI checks, then closed the test processes and removed those profiles; did not restart or alter the user's running app.

## Verification
- Config migration, IPC channels, and Island auto-expand regressions: 31 tests passed.
- Initial typecheck found the separate renderer AppConfig declaration; added its optional field. Final typecheck, integration check, build, and UI verification pending.
- Resumed verification: `npm run typecheck`, 31 targeted config/IPC/Island tests, `npm run test:integration` (14 tests), `npm run build`, and `git diff --check` passed. Build reports the existing large-bundle advisory.
- Isolated Playwright/Electron UI: default on; three off/on cycles immediately changed actual BrowserWindow visibility; window count and Island IPC listener count stayed unchanged; disk configuration matched each toggle; after desktop restart, disabled remained unchecked and hidden; completion=false/approval=true sound preferences remained unchanged. Result: DESKTOP_ISLAND_OK.
- Inspected enabled and disabled-after-restart General screenshots. Browser test against the actual compiled WebUI confirmed General contains no Island checkbox: WEB_UI_OK.
- Temporary verification-script issues were corrected without product changes: controlled async checkbox state requires waiting after click; Electron evaluate does not allow the extra dynamic import probe, so the remaining WebUI check ran separately and passed.
- `codegraph affected` reported no mapped affected tests; explicitly selected config/IPC/Island and runtime integration suites above. Final `git diff --check` passed.

## Notes
- Team context remains read-only. No commit requested.
- Existing unrelated TasksDetailTab key and tests/project-tasks-switch.test.ts were preserved. UI screenshots and temporary verification script stayed outside the repository under /tmp; no persisted project artifact or commit produced during resumption.
