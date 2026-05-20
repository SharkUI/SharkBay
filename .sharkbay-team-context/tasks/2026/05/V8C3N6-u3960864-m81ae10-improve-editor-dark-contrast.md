---
kind: sharkbay_task
taskId: V8C3N6-u3960864-m81ae10
taskTag: V8C3N6
mode: quick
title: Improve editor dark theme contrast
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
branch: main
createdAt: 2026-05-20T03:28:28Z
updatedAt: 2026-05-20T03:35:28Z
completedAt: 2026-05-20T03:35:28Z
commit: a50b4f5b
---

## Summary
Improved the built-in CodeMirror editor readability when files are opened inside SharkBay's dark terminal-backed area. Morning and Night appearances now use a dark editor surface with high-contrast syntax colors.

## Files
- .sharkbay/tasks/V8C3N6-u3960864-m81ae10-improve-editor-dark-contrast.md
- package-lock.json
- package.json
- src/renderer/code-editor.tsx

## Work
- Searched team context for related CodeMirror, editor, dark theme, and terminal contrast tasks.
- Found prior CodeMirror dependency work only; no prior dark editor contrast task affected this change.
- Updating the built-in editor so dark terminal-backed appearances use a dark editor surface and high-contrast syntax colors.
- Declaring `@lezer/highlight` as a direct dependency because the renderer now imports CodeMirror highlight tags directly.
- Changed editor theme selection so only Day uses the light editor theme; Morning and Night use the dark editor theme.
- Added explicit dark editor, gutter, active-line, bracket, selection, and syntax highlight colors.
- Preparing a Git commit for the editor contrast fix.

## Verification
- `git diff --check`
- `npm run typecheck`
- `npm run build` passed; Vite reported the existing large chunk size warning.

## Notes
- User reported code opened from Files is hard to read in the dark terminal/editor area.
