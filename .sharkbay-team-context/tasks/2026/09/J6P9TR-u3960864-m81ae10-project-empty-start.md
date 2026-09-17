---
kind: sharkbay_task
taskId: J6P9TR-u3960864-m81ae10
taskTag: J6P9TR
mode: task
title: Add minimal project empty workspace launch and setup
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a0ae8b-74cf-7132-97b0-3651af9b8f75
branch: main
createdAt: 2026-09-17T10:28:44Z
updatedAt: 2026-09-17T10:41:29Z
completedAt: 2026-09-17T10:41:29Z
---

## Summary
Implemented the selected project's empty workspace with compact Terminal/installed-Agent launch buttons and three setup rows (GitHub, Harness, Hooks). The view uses existing desktop styling with light/dark colors, real setup checks, and existing launch/install paths; closing the last tab returns to it.

## Files
- src/renderer/App.tsx
- src/renderer/project-start.tsx
- src/styles/app.css
- src/main/github.ts
- src/main/project-setup.ts
- src/shared/types.ts
- src/shared/ipc-channels.ts
- src/renderer/types.ts
- electron/ipc.ts
- electron/preload.mts
- tests/github.test.ts
- tests/ipc-channels.test.ts
- tests/ipc-protocol-install.test.ts
- .sharkbay/previews/J6P9TR/ (isolated desktop renderer verification fixtures)
- .sharkbay/tasks/J6P9TR-u3960864-m81ae10-project-empty-start.md

## Work
- Follow-up to prototype P7N4UX-u3960864-m81ae10. User explicitly wants simple native-desktop styling: no content headings, group dividers, onboarding wizard, or web-style cards.
- Plan: inspect current lifecycle/setup APIs; implement empty-state launch and readiness with existing controls; verify behavior and light/dark rendering.
- Initial worktree clean on main. Team context searched; preserve project-local Harness, optional GitHub, and installed-agent startup behavior.
- Reviewed R6M4T8-u3960864-m81ae10 and 1ZRFFN-u3960864-m81ae10: local Harness must remain usable without GitHub authentication/write access. Add missing unauthenticated fallback without changing team-sync behavior for authenticated writable repositories.
- Readiness will inspect installed hook connector configuration, not rely on optimistic localStorage flags. GitHub install/login uses a normal project terminal; missing Homebrew links to the official CLI installer. Only selected empty local workspaces load readiness.
- Implemented a compact desktop empty state and removed automatic blank-shell creation; existing restored tabs, project switching, terminal/Agent launch handlers, and session content are retained. Hide the disabled prompt bar while the selected project has no tabs.
- Keep GitHub optional for launch. Missing gh opens Homebrew installation in a project terminal when available, otherwise the official CLI installer page; unauthenticated gh opens its interactive login. Harness supports local installation without gh identity. Hooks enable only missing supported installed Agents and refresh actual connector status after completion.
- Desktop verification used the production renderer bundle in an isolated Electron window with a test preload and separate user data. No real authentication, package installation, hooks, or user sessions were changed during UI checks. Test window closed afterward.

## Verification
- `npm run typecheck` passed. Focused GitHub/IPC/protocol/renderer/Harness suites passed: 5 files, 49 tests. `git diff --check` passed.
- Final `npm run build` and `npm run typecheck` passed after the final source edits.
- CUA verified actual light and dark desktop rendering, Harness/Hook status changes using test IPC, direct Terminal/Codex startup while GitHub remains unavailable, project switching with an existing session, and returning after closing the last tab. Agent launch retained its explicit agentId and initial-command path.
- `codegraph affected` reported no affected tests in its index; selected the relevant 5 suites explicitly. Live third-party install/authentication was intentionally not performed; command selection and unauthenticated local installation are covered by regression tests.

## Notes
- No commit or package requested in this task. Do not touch .sharkbay/team-context/.
- Apply design-semantic-interfaces skill; keep the selected project and existing sessions stable when the empty state appears or disappears.
