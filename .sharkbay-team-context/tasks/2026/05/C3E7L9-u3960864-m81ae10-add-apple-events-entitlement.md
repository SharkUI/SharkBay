---
kind: sharkbay_task
taskId: C3E7L9-u3960864-m81ae10
taskTag: C3E7L9
mode: quick
title: Add Apple Events entitlement
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent:
createdAt: 2026-05-17T11:05:15Z
updatedAt: 2026-05-17T11:07:33Z
completedAt: 2026-05-17T11:07:33Z
---

## Summary
Added macOS signing configuration so SharkBay can request Apple Events automation permission for terminal-launched local tools.

## Files
- package.json
- build/entitlements.mac.plist
- build/entitlements.mac.inherit.plist
- tests/build-config.test.ts
- docs/release.md

## Work
- Started signing configuration update after diagnosing missing Apple Events entitlement on `xyz.sharkbay.app`.
- Added explicit Electron Builder macOS entitlements and release documentation.
- Verified packed app contains the Apple Events entitlement on the main bundle and not on the renderer helper.

## Verification
- `npm test -- tests/build-config.test.ts`
- `npm run typecheck`
- `npm run pack`
- `codesign -d --entitlements :- release/mac-arm64/SharkBay.app`
- `plutil -p release/mac-arm64/SharkBay.app/Contents/Info.plist`
- `codesign -d --entitlements :- 'release/mac-arm64/SharkBay.app/Contents/Frameworks/SharkBay Helper (Renderer).app'`
- `npm test`

## Notes
- Related team-context task: M7P2K4-u3960864-m81ae10 only repacked the app and did not change signing configuration.
