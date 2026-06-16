---
kind: sharkbay_task
taskId: M8D2KY-u3960864-m81ae10
taskTag: M8D2KY
mode: task
title: Split agent status sound controls
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019ec9a8-1e46-77a2-bdcf-6cb2ec9cada3
branch: main
createdAt: 2026-06-15T05:09:25Z
updatedAt: 2026-06-15T05:29:38Z
completedAt: 2026-06-15T05:14:36Z
commits:
  - 4071926228566b6677414c80c610fe9664c197ab
---

## Summary
Split agent status sound preferences into independent completion and approval controls. Settings now exposes separate toggles and preview buttons, and the island plays each sound only when its matching preference is enabled.

## Files
- electron/ipc.ts
- electron/island-preload.mts
- electron/main.ts
- src/island/island.html
- src/main/config.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/shared/types.ts

## Work
- Started follow-up task to split agent status sound controls into two independent settings and preview buttons.
- Used CodeGraph to locate the existing `statusChangeNotificationsEnabled` path through Settings, config, and island.
- Searched team context for related sound/status work; no direct overlap found.
- Related prior local task: Q7N4PS-u3960864-m81ae10.
- Decided to keep the legacy `statusChangeNotificationsEnabled` value as a compatibility default while adding separate completion and approval sound fields.
- Added split sound config fields, IPC/preload preference syncing, island-side per-sound playback checks, and Settings rows with independent previews.
- Ran full tests after build; failures were in project file listing and machine profile detection paths outside this sound-settings change.
- Prepared the split sound control changes for commit.
- Committed split sound controls in `4071926228566b6677414c80c610fe9664c197ab`.

## Verification
- `codegraph affected electron/ipc.ts electron/island-preload.mts electron/main.ts electron/preload.mts src/island/island.html src/main/config.ts src/renderer/App.tsx src/renderer/types.ts src/shared/types.ts src/styles/app.css` returned no affected test files.
- `npm run typecheck` passed.
- `npm run build` passed.
- `git diff --check` passed.
- `npx vitest run tests/config-migration.test.ts` passed.
- `npm run test` failed: `tests/project-files.test.ts` has two existing path-safety/listing assertion failures, and `tests/profile-orchestrator.test.ts` reports `profile.os.platform` as `unknown`.
- `npx vitest run tests/project-files.test.ts` and `npx vitest run tests/profile-orchestrator.test.ts` reproduce those same failures.

## Notes
- Keep `.sharkbay/team-context/` read-only.
