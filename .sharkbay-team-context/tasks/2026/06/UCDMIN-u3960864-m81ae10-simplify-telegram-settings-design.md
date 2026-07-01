---
kind: sharkbay_task
taskId: UCDMIN-u3960864-m81ae10
taskTag: UCDMIN
mode: quick
title: Simplify Telegram settings design
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019f11ff-5e3e-7da3-9175-8b00055b3411
branch: main
createdAt: 2026-06-29T06:11:22Z
updatedAt: 2026-07-01T14:25:45Z
completedAt: 2026-06-29T07:50:06Z
---

## Summary
Rebuilt the Telegram settings mockup as a simpler UCD-oriented multi-state settings demo aligned with the current SharkBay Settings VI. The no-token state now shows only token setup, while connected states progressively reveal remote control, pairing, and token replacement only after the user chooses Replace token.

## Files
- docs/shared/telegram-settings-design.html

## Work
- Reviewed prior team task TELEUX-u3960864-m81ae10 before changing the mockup.
- Rebuilt the Telegram settings mockup as a single focused settings surface.
- Removed state preview navigation, side notes, flow/security cards, and extra setup states from the visible UI.
- Added clearer disabled styling so unavailable actions do not look clickable.
- Reopened the task after user feedback that the simplified mockup no longer matched SharkBay Settings VI.
- Reworked the mockup to load `src/styles/app.css` and mirror the current `SettingsView` / `TelegramSettingsPanel` structure.
- Fixed static-demo-only hidden/input/button constraints exposed by visual verification.
- Reopened the task to split the mockup into multiple data states so irrelevant controls are absent, not merely disabled.
- Replaced the single interactive mock with three static settings states: no token, connected with no paired users, and connected with a paired user.
- Removed enable and pairing controls from the no-token state.
- Reopened the task to change connected token replacement from an always-visible input to a progressive disclosure button.
- Replaced the always-visible saved-token input in connected states with a `Replace token` button.
- Added progressive disclosure so the replacement token input appears only after clicking `Replace token`.

## Verification
- `node -e` sanity check: verified key HTML markers and disabled-state CSS are present.
- `node -e` whitespace check: passed.
- Playwright desktop and mobile render/interaction check: passed; verified no horizontal overflow, initial disabled pairing state, connect flow, and pairing flow.
- Playwright VI regression check: passed; verified `app.css` loads, current Settings class markers are present, paired user starts hidden, and `Save token` stays single-line.
- Playwright multi-state check: passed; verified three states render, no-token has only one panel, no-token has no enable checkbox or pairing, connected states include the expected controls, and desktop/mobile have no horizontal overflow.
- Playwright replace-token check: passed; verified connected states start with replacement inputs hidden, `Replace token` reveals the input, save remains disabled until a long enough token is typed, and desktop/mobile remain overflow-free.

## Notes
- User requested a simpler UCD-oriented Telegram Settings mockup with less invalid information.
- Correction direction: keep UCD simplification, but match the current SharkBay Settings visual identity.
