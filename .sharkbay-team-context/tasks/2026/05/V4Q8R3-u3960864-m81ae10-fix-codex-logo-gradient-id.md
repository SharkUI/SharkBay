---
kind: sharkbay_task
taskId: V4Q8R3-u3960864-m81ae10
taskTag: V4Q8R3
mode: quick
title: Fix Codex session card icon showing incomplete
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Claude Code Opus 4.6
sessionId: e77624a0-d97f-4a9a-a0a0-1261d5064d35
branch: main
createdAt: 2026-05-30T09:16:57Z
updatedAt: 2026-05-30T09:17:48Z
completedAt: 2026-05-30T09:17:48Z
---

## Summary
Fix CodexLogoColorIcon using a hardcoded SVG gradient ID causing duplicate-ID conflicts when multiple Codex session cards render — the cloud fill disappears.

## Files
- src/renderer/App.tsx

## Work
- Identified that `CodexLogoColorIcon` uses `id="codex-logo-gradient"` for its linearGradient; when multiple instances render, only the first resolves correctly.
- Fix: use React `useId()` to generate a unique gradient ID per instance.

## Verification
- Visual: multiple Codex session cards should each show the full gradient cloud icon.

## Notes
- Related to commit 46c8fda4 which introduced the colored agent logo variants.
