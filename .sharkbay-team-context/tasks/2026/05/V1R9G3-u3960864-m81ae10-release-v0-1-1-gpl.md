---
kind: sharkbay_task
taskId: V1R9G3-u3960864-m81ae10
taskTag: V1R9G3
mode: task
title: Release v0.1.1 under GPLv3
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-5
sessionId: 019e6c4f-cb85-7fe0-80b0-28a69a262997
branch: main
createdAt: 2026-05-28T02:13:34Z
updatedAt: 2026-05-28T02:30:05Z
completedAt: 2026-05-28T02:30:05Z
commits:
  - 0539a5b9d12068f1edff08d85c8abdb578865eef
---

## Summary
Released SharkBay v0.1.1 under GPLv3, with macOS DMG and ZIP artifacts generated and the `v0.1.1` GitHub Release created with the DMG asset.

## Files
- LICENSE
- README.md
- package.json
- package-lock.json
- release/SharkBay-0.1.1-arm64.dmg
- release/SharkBay-0.1.1-arm64.dmg.blockmap
- release/SharkBay-0.1.1-arm64-mac.zip
- release/SharkBay-0.1.1-arm64-mac.zip.blockmap
- release/latest-mac.yml
- release/mac-arm64/SharkBay.app
- .sharkbay/tasks/V1R9G3-u3960864-m81ae10-release-v0-1-1-gpl.md
- Git tag: `v0.1.1`

## Work
- Switched from `remove-remote-machines` back to `main` per request.
- Started release tracking for version, license, packaging, and GitHub Release preparation.
- Bumped npm/Electron Builder package version to `0.1.1`.
- Added GPLv3 license text and project metadata using `GPL-3.0-only`.
- Built macOS distribution artifacts with `npm run dist`.
- Committed the version/license changes as `0539a5b9d12068f1edff08d85c8abdb578865eef`.
- Created and pushed annotated tag `v0.1.1`; pushed `main` to GitHub.
- Attempted to create a GitHub draft release with the DMG asset, but GitHub API access failed from the shell.
- User later ran the `gh release create` command successfully to publish the GitHub Release asset.

## Verification
- `npm install --package-lock-only --ignore-scripts` completed and synchronized lockfile metadata; npm reported existing audit findings.
- `npm run typecheck` passed.
- `npm test` passed: 40 test files, 146 tests.
- `npm run dist` passed and produced `release/SharkBay-0.1.1-arm64.dmg` and `release/SharkBay-0.1.1-arm64-mac.zip`.
- `plutil -extract CFBundleShortVersionString raw -o - release/mac-arm64/SharkBay.app/Contents/Info.plist` returned `0.1.1`.
- `codesign --verify --deep --strict release/mac-arm64/SharkBay.app` passed.
- `shasum -a 256 release/SharkBay-0.1.1-arm64.dmg` returned `e59a84da90a1124d618d19366d4c5b75a834888d71e033dbda5b28f6d5c118cc`.
- `git ls-remote --tags origin v0.1.1` confirmed the remote tag exists.
- `gh release create v0.1.1 ...` failed with `error connecting to api.github.com`; `curl -I https://api.github.com` failed with `Could not resolve host: api.github.com`.
- User reported the `gh release create` command was run successfully afterward.
- Follow-up `gh release view v0.1.1 --json tagName,url,isDraft,isPrerelease,name,assets` still failed locally with `error connecting to api.github.com`, so the GitHub Release could not be independently re-read from this shell.

## Notes
- Related team records: `G7V0T1-u3960864-m81ae10` tagged `v0.1`; multiple packaging tasks used `npm run pack`/`npm run dist` and produced macOS artifacts under `release/`.
- `main` was already ahead of `origin/main` by `64f4e33a` before this task; pushing `main` published that pre-existing local commit along with this task's release commit.
- GitHub API access from this shell remained unavailable after the user completed the release creation separately.
