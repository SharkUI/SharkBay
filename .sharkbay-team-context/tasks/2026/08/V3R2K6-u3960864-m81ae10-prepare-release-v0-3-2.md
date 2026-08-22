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
updatedAt: 2026-08-22T03:46:53Z
completedAt: 2026-08-22T03:46:53Z
commits:
  - 53c99f57d56057370bc3d8ed1bc9df10fad78526
---

## Summary

Published SharkBay v0.3.2 using the repository's existing release conventions. The macOS application is Developer ID signed, Apple-notarized, stapled, and distributed through a public GitHub Release whose tag, assets, update metadata, and checksums were verified against the local release outputs.

## Files

- package.json
- package-lock.json
- CHANGELOG.md
- release/v0.3.2-notes.md

## Work

- Treat "prepare release" as updating and validating release artifacts locally.
- Do not push, tag, or create a GitHub Release without explicit authorization.
- Starting point: clean `main` at `031d5fecb1c683a4262355b9f758549ed0031dba`, aligned with `origin/main`.
- Confirmed the repository's previous release commit changed only `package.json`, `package-lock.json`, and `CHANGELOG.md`, using commit message `chore(release): v0.3.1`.
- Bumped both package manifests to `0.3.2` and added release notes dated 2026-08-22 covering the five commits since `v0.3.1`.
- Built both unpacked and distributable macOS arm64 artifacts locally.
- Used the Computer Use skill to smoke-test the packaged Electron application and its Agent CLIs settings: Reasonix is present and CodeWhale is absent.
- Initially kept the local artifacts unpublished because the available Developer ID signing identity succeeded but Apple notarization credentials were not configured.
- Created local release commit `53c99f57d56057370bc3d8ed1bc9df10fad78526` (`chore(release): v0.3.2`).
- Reopened the task after authorization to continue with the public release: notarize and validate artifacts, push `main`, create and push annotated tag `v0.3.2`, then create the GitHub Release.
- Confirmed GitHub CLI authentication for `SharkUI`, repository write access, the existing Developer ID Application identity, and that `v0.3.2` does not yet exist locally.
- Paused before any remote mutation because no Apple notarization environment variables, `notarytool` keychain profile, or local App Store Connect API key is configured.
- Validated the user-configured `sharkbay-release` keychain profile and received Apple notarization acceptance for submission `c6bbf6e2-a589-43cd-b7db-b2ce01bce712`.
- Stapled the ticket to the signed app and regenerated the final DMG, ZIP, blockmaps, and update metadata from the notarized app.
- Created `release/v0.3.2-notes.md` with the changelog and final artifact checksums.
- Atomically pushed `main` and annotated tag `v0.3.2`; the tag resolves to release commit `53c99f57d56057370bc3d8ed1bc9df10fad78526`.
- Published GitHub Release `SharkBay v0.3.2` with the DMG, ZIP, both blockmaps, and `latest-mac.yml`.
- Removed the 351 MB of temporary notarization and verification staging created during this release.

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
- The initial unnotarized build was replaced before publication; final `spctl` and `stapler validate` checks pass for both ZIP and DMG contents.
- Publication preflight — passed; GitHub authentication, repository access, Developer ID signing identity, and Apple notarization credentials are available.
- Apple notarization — passed; submission `c6bbf6e2-a589-43cd-b7db-b2ce01bce712` is `Accepted`.
- Final ZIP and DMG — passed archive/disk-image integrity checks; each embedded app has a valid stapled ticket, passes Gatekeeper as `Notarized Developer ID`, passes strict deep code-sign verification, and reports version `0.3.2`.
- Final artifact SHA-256: DMG `1ccbc986c0ee40fd4550cf017fac84d1eace9d76772500a5de270d694c782927`; ZIP `ee3d6419149e723afd486f3b0434e21bea957770c7d6dbe493f801b7d5f906a2`.
- Remote preflight after fetch — passed; `origin/main` remains at the expected starting commit, and no `v0.3.2` tag or GitHub Release exists.
- Remote publication — passed; `origin/main` and peeled tag `v0.3.2` both resolve to `53c99f57d56057370bc3d8ed1bc9df10fad78526`.
- GitHub Release — passed; it is public, non-draft, non-prerelease, and contains all five expected uploaded assets.
- Uploaded asset integrity — passed; GitHub's SHA-256 digest for every asset matches the local file, including DMG `1ccbc986c0ee40fd4550cf017fac84d1eace9d76772500a5de270d694c782927` and ZIP `ee3d6419149e723afd486f3b0434e21bea957770c7d6dbe493f801b7d5f906a2`.
- Final repository state — passed; `main` is aligned with `origin/main` and the worktree is clean.

## Notes

- Release target: v0.3.2.
- Published release: https://github.com/SharkUI/SharkBay/releases/tag/v0.3.2
