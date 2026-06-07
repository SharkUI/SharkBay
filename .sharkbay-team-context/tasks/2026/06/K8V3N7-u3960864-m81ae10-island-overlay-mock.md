---
kind: sharkbay_task
taskId: K8V3N7-u3960864-m81ae10
taskTag: K8V3N7
mode: task
title: Island overlay window with live session data
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude
sessionId: 5b2bc286-6643-4082-a11d-229778da069d
branch: feat/island-overlay
createdAt: 2026-06-07T04:20:12Z
updatedAt: 2026-06-07T14:37:09Z
status: completed
completedAt: 2026-06-07T14:37:09Z
commits:
  - ec218391
---

## Summary
Island overlay window at the macOS notch showing live SharkBay agent sessions. Closed state merges with the notch as a horizontal extension with status dots; opens to a session list (project name + status label + last prompt + tab title). Click a session to switch project and focus its terminal tab. Sessions mirror SharkBay agent tabs (open tab = present, closed = gone). Last prompt is recorded by SharkBay itself and persists across restore/restart.

## Files
- src/island/island.html
- electron/island-preload.mts
- electron/preload.mts
- electron/main.ts
- electron/ipc.ts
- src/shared/ipc-channels.ts
- src/shared/app-events.ts
- src/shared/types.ts
- src/main/hooks/state-manager.ts
- src/main/hooks/prompt-store.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- tests/ipc-channels.test.ts
- tests/prompt-store.test.ts

## Work
- Island BrowserWindow: frameless, transparent, screen-saver level, roundedCorners:false, top-center; dynamic height by session count with max + scroll
- Closed pill: horizontal notch extension, status dots (working/idle/attention/awaiting) matching tab indicator (circular + glow); setIgnoreMouseEvents via dynamic window resize so transparent area passes clicks through
- Session source = SharkBay agent tabs (renderer syncIslandTabs on spaces change), NOT hook session manager — open tab present, closed tab gone
- Row layout: left = project name + colored status label; subtitle = last user prompt (ellipsis); right = tab title
- Click row → main focuses window, switches project (setSelectedId) + active tab, collapses island
- Last-prompt feature pivoted away from reading agents' own transcript files (fragile: kiro/codex/claude/codewhale all store differently or not at all). New design: SessionPromptStore records prompts SharkBay sees (input bar + live hook prompt), keyed by stable agent session id, persisted to userData
- Root-caused "only shows when working": renderer terminalSessionId match failed during idle (pid unresolved on restore). Fixed by injecting lastPrompt in main's islandTabsSync using authoritative hookSessionToTerminal + promptStore
- Fixed app quit (destroy island on before-quit), island packaging path, preload var collision

## Verification
- `tsc --noEmit` passes for both node and renderer projects
- `vitest run tests/hook-sessions.test.ts tests/ipc-channels.test.ts tests/prompt-store.test.ts` — all pass
- User-confirmed in packaged build: session list, click-to-focus across projects, last prompt on restore

## Notes
- References R4V8K2 (open-vibe-island research)
- `--notch-height: 32px`, `--closed-width: 295px` tuned for this MacBook; may differ per model
- Prompt store only captures prompts produced after this version ships; historical sessions have none
- Limitation: prompts typed directly in the agent terminal (not the input bar) for agents that send no prompt hooks (claude, codewhale) are not captured
- Not yet done: notification auto-expand for attention events, approve/answer interaction (deferred feature set 4+)
