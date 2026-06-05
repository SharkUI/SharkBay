---
kind: sharkbay_task
taskId: W2N8K4-u3960864-m81ae10
taskTag: W2N8K4
mode: task
title: Add init action prompts to detail panels
status: completed
completedAt: 2026-05-31T09:45:43Z
commits:
  - fd7e8286
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: e60cc129-c0f7-4b0c-8c0d-3f861ed7116f
branch: main
createdAt: 2026-05-31T09:32:44Z
updatedAt: 2026-05-31T09:45:43Z
---

## Summary
Add initialization prompts to Sessions, Git, and Files detail panels when their prerequisite features are not yet configured.

## Files
- src/renderer/App.tsx
- src/styles/app.css

## Work
- Sessions panel: show "Enable Hooks" prompt when all detected agents have hooks disabled; clicking enables hooks for all hookSupportedAgents that are installed.
- Git panel: show "Initialize Repository" prompt when project has no git; offer "git init" (local) and "Clone Remote" as two actions, both open a new terminal tab with prefilled command.
- Files panel: show "Install CodeGraph" prompt when codeGraphStatus.status?.state === "not-installed"; clicking opens terminal tab with `npm i -g @colbymchenry/codegraph` prefilled.
- Added `onOpenTerminal` callback prop threaded from ProjectDetailPane through to Git and Files tabs, wired to `openAgentSession` on the terminal pane ref (properly creates a visible terminal tab).

## Verification
- TypeScript: `npx tsc --noEmit -p tsconfig.renderer.json` — clean
- TypeScript: `npx tsc --noEmit -p tsconfig.node.json` — clean
- Tests: `npx vitest run` — 157 passed, 0 failed

## Notes
- Pattern follows existing Tasks panel "Install Protocol" card (confirm-panel protocol-action-card)
- Git detection: `isGitManaged` in ProjectDetailPane is derived from `detail.dirtyWorktree !== null`; `false` means no git
- Hooks enabled state is per-agent in localStorage (`sharkbay:agent-hooks-enabled:<id>`)
- hookSupportedAgents: claude, codex, gemini, kiro, qwen, codewhale, opencode
- CodeGraph install: `npm i -g @colbymchenry/codegraph` (official npm package)
- Terminal create API: `getBridge().terminal?.create({ cwdUri, initialCommand, ... })`
