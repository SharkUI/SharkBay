---
kind: sharkbay_task
taskId: V3R2K6-u3960864-m81ae10
taskTag: V3R2K6
mode: task
title: Prepare release v0.3.2
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5.6
sessionId: 01a01de3-9a94-7851-8987-56a12a3b7352
branch: main
createdAt: 2026-08-22T03:17:06Z
updatedAt: 2026-08-22T03:26:12Z
completedAt: 2026-08-22T03:26:12Z
commits:
  - 53c99f57d56057370bc3d8ed1bc9df10fad78526
---

## Summary

Prepared SharkBay v0.3.2 using the repository's existing release conventions. Version metadata and release notes are committed locally, the complete release checklist passed, and the only remaining publication prerequisite is rebuilding with Apple notarization credentials.

## Files

- package.json
- package-lock.json
- CHANGELOG.md

## Work

- Treat "prepare release" as updating and validating release artifacts locally.
- Do not push, tag, or create a GitHub Release without explicit authorization.
- Starting point: clean `main` at `031d5fecb1c683a4262355b9f758549ed0031dba`, aligned with `origin/main`.
- Confirmed the repository's previous release commit changed only `package.json`, `package-lock.json`, and `CHANGELOG.md`, using commit message `chore(release): v0.3.1`.
- Bumped both package manifests to `0.3.2` and added release notes dated 2026-08-22 covering the five commits since `v0.3.1`.
- Built both unpacked and distributable macOS arm64 artifacts locally.
- Used the Computer Use skill to smoke-test the packaged Electron application and its Agent CLIs settings: Reasonix is present and CodeWhale is absent.
- Kept the local artifacts unpublished because the available Developer ID signing identity succeeded but Apple notarization credentials were not configured.
- Created local release commit `53c99f57d56057370bc3d8ed1bc9df10fad78526` (`chore(release): v0.3.2`).

## Verification

- `npm run typecheck` — passed.
- `npm test` — passed (60 files, 343 tests).
- `npm run build` — passed.
- `npm run pack` — passed; unpacked app reports version `0.3.2` and launches successfully.
- `npm run dist` — passed; generated `SharkBay-0.3.2-arm64.dmg` and `SharkBay-0.3.2-arm64-mac.zip`.
- Package metadata check — passed; `package.json`, `package-lock.json`, the packaged app, and `Info.plist` all report `0.3.2`.
- Packaged UI smoke test — passed; main window and Settings > Agent CLIs load, Reasonix is present, and CodeWhale is absent.
- `codesign --verify --deep --strict --verbose=2 release/mac-arm64/SharkBay.app` — passed with Developer ID Application signing and hardened runtime.
- `unzip -tq release/SharkBay-0.3.2-arm64-mac.zip` and `hdiutil verify release/SharkBay-0.3.2-arm64.dmg` — passed.
- `git diff --check` — passed.
- Post-commit metadata check — passed; all three manifest version locations report `0.3.2`, the worktree is clean, and `main` is one commit ahead of `origin/main`.
- Release-readiness caveat: `spctl` rejects the local app as `Unnotarized Developer ID`, and `stapler validate` confirms no ticket is stapled. Rebuild with Apple notarization credentials before publishing.

## Notes

- Release target: v0.3.2.
