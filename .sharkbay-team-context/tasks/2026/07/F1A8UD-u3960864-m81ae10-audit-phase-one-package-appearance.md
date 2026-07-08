---
kind: sharkbay_task
taskId: F1A8UD-u3960864-m81ae10
taskTag: F1A8UD
mode: task
title: Audit phase one package and appearance fixes
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f3fd9-becc-7ba1-b5a1-549001149a38
branch: audit
createdAt: 2026-07-08T04:03:44Z
updatedAt: 2026-07-08T04:10:25Z
completedAt: 2026-07-08T04:10:25Z
---

## Summary
Implemented phase one audit improvements: reduced packaged app contents and completed terminal appearance persistence.
The unpacked macOS app now measures 252M locally, with app.asar reduced to 17M and app.asar.unpacked to 12M.

## Files
- electron/ipc.ts
- electron/preload.mts
- package.json
- src/main/config.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/ipc-channels.ts
- src/shared/types.ts
- tests/build-config.test.ts
- tests/config-migration.test.ts
- tests/ipc-channels.test.ts
- vite.config.ts
- .sharkbay/tasks/F1A8UD-u3960864-m81ae10-audit-phase-one-package-appearance.md

## Work
- Created `audit` branch from clean `main`.
- Started from audit task A6D8QK findings and team-context task YBS6VW, which noted the missing backend terminal appearance persistence handler.
- Added terminal appearance IPC/config persistence plumbing and tests, preserving `null` reset semantics.
- Tightened package configuration to exclude non-runtime build outputs, native build residue, and unused packaged resources.
- Disabled renderer production sourcemaps while keeping minification disabled because prior packaged xterm regressions were tied to minification.
- Verified packaged contents no longer include dist-electron tests/maps/types/tsbuildinfo, bun-pty, better-sqlite3 source/deps, or node_modules maps/types/markdown files.

## Verification
- `npm run typecheck` passed.
- `npx vitest run tests/config-migration.test.ts tests/ipc-channels.test.ts tests/build-config.test.ts` passed.
- `npm test` passed: 57 files, 320 tests.
- `npm run pack` passed and produced `release/mac-arm64/SharkBay.app`.
- Packaged size check: `du -sh release/mac-arm64/SharkBay.app ...` reported app 252M, app.asar 17M, app.asar.unpacked 12M, resources 1.9M.
- `npx asar list release/mac-arm64/SharkBay.app/Contents/Resources/app.asar | rg ...` found no excluded runtime-pruning patterns.
- Electron ABI native load check for extracted packaged `better-sqlite3` returned `1`.
- `git diff --check` passed.

## Notes
- Success criteria: typecheck and tests pass; package config prevents non-runtime files from being included; terminal appearance settings persist through config load/save.
- No commit was produced.
