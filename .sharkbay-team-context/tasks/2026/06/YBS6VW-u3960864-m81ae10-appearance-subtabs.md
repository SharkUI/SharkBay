---
kind: sharkbay_task
taskId: YBS6VW-u3960864-m81ae10
taskTag: YBS6VW
mode: task
title: Implement appearance settings with Theme/Color/Font sub-tabs
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude 4.6
sessionId: 9acb9849-a81c-43a3-9107-4c56ab964cf0
branch: main
createdAt: 2026-06-06T12:13:46Z
updatedAt: 2026-06-06T12:52:32Z
completedAt: 2026-06-06T12:52:32Z
commits:
  - c4ab708c
---

## Summary
Added sub-tabs (Theme/Color/Font) to AppearanceSettingsPanel. Color schemes from iTerm2-Color-Schemes with live terminal preview. Font tab with family/size/line-height. Config persists via bridge.config.setTerminalAppearance.

## Files
- src/renderer/App.tsx
- src/renderer/color-schemes.ts
- src/renderer/types.ts
- src/shared/types.ts
- src/styles/app.css

## Work
- Created color-schemes.ts with 15 curated schemes (13 dark + 2 light) from iTerm2-Color-Schemes windowsterminal format
- Rewrote AppearanceSettingsPanel with sub-tab navigation (Theme/Color/Font)
- Theme sub-tab: preserved existing morning/day/night radio cards
- Color sub-tab: scheme list with swatches, live terminal preview, per-theme defaults, reset button
- Font sub-tab: font family select, font size, line height inputs with live preview
- Added terminalColorScheme/terminalFontFamily/terminalFontSize/terminalLineHeight to AppConfig (shared + renderer)
- Added setTerminalAppearance to bridge config interface
- Reactive useEffects update existing terminals on setting changes
- Updated createXTerm to accept terminal appearance options
- Removed unused appearanceDescription function and subtitle from heading
- Added CSS with night theme overrides

## Verification
- `npm run build` passes (tsc + vite build) with no errors

## Notes
- Bridge backend handler (setTerminalAppearance) not yet implemented in electron/main.ts — needs implementation to persist to disk
- themeDefaults maps: morning→atom-one-dark, day→nord, night→catppuccin-mocha
- ColorScheme type exported for downstream use
