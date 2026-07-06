---
kind: sharkbay_task
taskId: PK9F2S-u3960864-m81ae10
taskTag: PK9F2S
mode: quick
title: Skip code signing in npm run pack
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: f7f05bd3-9836-42a8-a9b7-77e24d160917
branch: main
createdAt: 2026-07-06T10:30:50Z
updatedAt: 2026-07-06T10:35:20Z
completedAt: 2026-07-06T10:35:20Z
commits:
  - de535482
---

## Summary
Make `npm run pack` (local smoke-test build) skip Developer ID signing and
notarization by setting `CSC_IDENTITY_AUTO_DISCOVERY=false`, so it stays fast and
never touches the keychain or Apple. `npm run dist` keeps signing + notarization.

## Files
- package.json — `scripts.pack`

## Work
- Prepend `CSC_IDENTITY_AUTO_DISCOVERY=false` to the electron-builder call in the pack script.

## Verification
- `npm run pack` now logs "falling back to ad-hoc signature", signs with identityName=`-` (ad-hoc, no Developer ID / no keychain), and skips notarization — fast, offline.
- `dist` script unchanged, so `npm run dist` still auto-discovers the Developer ID cert and signs + notarizes.
- Committed de535482 locally (package.json only); not pushed, per user ("commit就可以了").

## Notes
- macOS-only project (electron-builder --mac), so inline env var in the npm script is fine.
- Follow-up to the signing/notarization work (task BR3WK8): pack was signing with Developer ID after notarize was enabled.
