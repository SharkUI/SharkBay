# Release And Packaging

SharkBay distributes Runtime and WebUI together as an npm package. The optional Electron desktop client is packaged separately for macOS 13 Ventura or later on Apple Silicon (arm64). The [current facts table](current-facts.md) summarizes current behavior.

## Runtime and WebUI

`npm run pack:runtime` creates `release/sharkbay-runtime-<version>.tgz` using the repository version and locked direct runtime dependencies. The archive contains the compiled Node service, CLI, and WebUI assets. It targets Node.js 22.12+ in the 22.x series on macOS and Linux x64/arm64. Install the tarball in an isolated npm prefix for release validation before publishing it to the npm registry.

Serve the installed WebUI with `sharkbay serve`. The default address is `http://127.0.0.1:17777/`. `sharkbay service enable` starts it with a macOS LaunchAgent or a Linux systemd user service, and `sharkbay service disable` stops and unregisters that service. The service uses the current user's default profile and the Node executable used at registration. `--lan` explicitly enables trusted LAN access. `SHARKBAY_RUNTIME_PORT` can set the service port.

After finishing active sessions, disable a registered service before updating Node or uninstalling the package. Re-enable it from the desired Node environment to register its executable again. Linux hosts that need to serve the WebUI before login can enable systemd lingering for their service user.

## Commands

Build TypeScript and renderer assets:

```bash
npm run build
```

Create an unpacked app for local smoke testing:

```bash
npm run pack
```

Create distributable macOS artifacts:

```bash
npm run dist
```

## Outputs

Electron Builder writes outputs to `release/`. The macOS config targets DMG and zip artifacts, and unpacked packs include a local app bundle under `release/mac-*`.

## Automatic Updates

Installed builds use `electron-updater` with the public `SharkUI/SharkBay`
GitHub Releases feed configured in `package.json`. The app checks at startup
and every four hours, downloads newer stable versions in the background, and
offers **Restart to update** or **Later**. Later defers installation until a
normal application quit; closing the macOS window only hides it. Explicit
update restarts disconnect the desktop client before invoking the installer;
the shared Node runtime and its terminals keep running. Stop that runtime
explicitly before activating an incompatible runtime upgrade. Development builds do not check or install updates.

**Check for Updates...** is available in the macOS app menu (File on other
platforms). It also brings a previously dismissed ready update back into view.
Failed downloads can be retried from the update message or at the next check.

For each release:

1. Increase the application version and run the release checks below.
2. Produce Developer ID signed, notarized and stapled artifacts. The ZIP must
   contain the final signed app; if any artifact changes, regenerate its
   blockmap and `latest-mac.yml` so sizes and checksums match.
3. Upload the DMG, ZIP, their generated blockmaps, and `latest-mac.yml` to the
   same GitHub Release. Include an architecture-compatible ZIP for each
   supported Mac architecture. The current release ships arm64.
4. Verify all assets before publishing the release as a stable, non-draft
   release. A commit or tag alone does not deliver an application update.

Use `npx electron-builder --mac --publish never` for local distributable
verification without uploading. The packaged app must include
`Contents/Resources/app-update.yml` pointing to the intended GitHub repository.
Keep publishing credentials on the build machine; public update clients do
not need a GitHub token.

Before the first updater-enabled public release, test an installed signed
version against a higher signed test version using an isolated test feed.
Verify automatic download, failed-download retry, normal-quit installation,
explicit restart after terminal cleanup, signature rejection, and retention
of app configuration. Do not exercise installation against a working user's
application or publish a test version to the production feed.

Versions shipped before this updater need one manual installation of an
updater-enabled release. Subsequent releases can update automatically.

### Signed Update Acceptance

On 2026-09-16, the current updater passed installation acceptance on a separate
arm64 Mac running macOS 26.3.1. Two Developer ID signed, notarized and stapled
test builds, 0.3.3 and 0.3.4, used the independent name `SharkBay Update QA`,
app ID `xyz.sharkbay.updateqa`, user data/config directories, and a loopback
HTTP feed. These version numbers were test fixtures, not public releases.

Verified behaviors:

- Startup discovers and downloads the newer version automatically.
- A failed download (HTTP 503) exposes Retry; restoring the feed succeeds.
- A ZIP with matching download checksums but a modified app signature is
  rejected, leaving the installed version unchanged.
- Later hides the prompt; a manual check restores it. Closing the window
  leaves the current version running.
- Restart to update installs 0.3.4 and reopens the app after terminating the
  old terminal shell and its child process.
- Normal quit installs 0.3.4 without reopening the app.
- Configuration, renderer local storage, and project files survive both paths.
  The installed result passes Gatekeeper and strict code signature checks.

This exercises signed installation through an isolated generic feed. The
production GitHub feed was checked separately; publishing a new production
release still requires verifying its uploaded ZIP and update metadata.
Task `N6T8V2-u3960864-m81ae10` records the acceptance environment and results.

## Package Inputs

The Electron Builder config in `package.json` includes:

- `dist/renderer/**/*`
- `dist-electron/**/*`, with explicit exclusions for compiled tests, source maps, declarations and build metadata
- `package.json`
- `resources/` as extra resources

The package entry is `dist-electron/electron/main.js`.

## Native Modules

The npm runtime loads `@lydell/node-pty` and `better-sqlite3` under ordinary Node. Validate installation and a real PTY on every advertised platform and Node ABI. The desktop package loads the existing runtime over the same-user control endpoint.

## Resources

Desktop icons are read from `resources/` in development and from `process.resourcesPath/resources` in packaged builds. Current app themes use day, night, and morning icon variants.

## macOS Signing

Electron Builder signs the macOS app with `build/entitlements.mac.plist` and child bundles with `build/entitlements.mac.inherit.plist`.

The main app entitlement includes `com.apple.security.automation.apple-events` so terminal-launched local tools can request macOS Automation access through SharkBay. Keep the Electron code-signing entitlements in both files; removing them can break arm64 Electron builds.

## Developer ID Signing And Notarization

The macOS config enables `hardenedRuntime` and `notarize`, so `npm run dist`
signs with a Developer ID Application certificate and notarizes with Apple.

Prerequisites:

- Active Apple Developer Program membership.
- A "Developer ID Application" certificate installed in the login keychain
  (Xcode → Settings → Accounts → Manage Certificates → +, or developer.apple.com).
- An app-specific password created at appleid.apple.com.
- The 10-character Team ID from developer.apple.com → Membership.

Provide credentials via environment variables when running `npm run dist`:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
# Signing cert: omit when the Developer ID cert is in the login keychain.
# For CI, supply the exported .p12 instead:
# export CSC_LINK="base64-or-path-to-cert.p12"
# export CSC_KEY_PASSWORD="cert-password"
```

Verify a signed, notarized, stapled build:

```bash
spctl --assess --verbose --type exec "release/mac-arm64/SharkBay.app"  # → accepted, source=Notarized Developer ID
xcrun stapler validate "release/mac-arm64/SharkBay.app"                 # → The validate action worked!
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/SharkBay.app"
```

Keep all Apple credentials out of the repo; pass them through the environment
(or CI secrets) only.

On the configured release Mac, the existing notarytool keychain profile is
`sharkbay-release`. Select it explicitly; an unset environment variable does
not mean the stored credentials are missing:

```bash
xcrun notarytool history --keychain-profile sharkbay-release
APPLE_KEYCHAIN_PROFILE=sharkbay-release npm run dist -- --publish never
```

The profile name is configuration, not the password. Keep the credential itself
in the keychain.

## Release Checks

Before producing distributable artifacts:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run pack`
5. `npm run pack:runtime`, then install the tarball and start it with a temporary runtime profile
6. Start the unpacked desktop app against the installed runtime and verify WebUI, PTY, and desktop exit
7. `npm run dist`

Local builds use ad-hoc signing unless signing and notarization credentials are configured.

## Known Packaging Note

`tsconfig.node.json` includes tests for compilation and checking, while Electron Builder explicitly excludes `dist-electron/tests/**/*`, source maps, declarations and build metadata from the desktop package. Check the actual artifact manifest for release acceptance; TypeScript include patterns alone do not describe shipped contents.

## Desktop migration

Publish and verify the Runtime npm package before offering the first desktop-only update. Include the installation and startup steps in that release's upgrade notes.

Finish active sessions and quit the old desktop app before stopping its bundled Runtime. Start the independently installed Runtime with the same profile to reuse the existing configuration, then launch the new desktop client. Closing or updating the desktop client leaves the Runtime and its sessions running. Keep the runtime and desktop versions on the same release when the control protocol changes.

After packaging, run `node scripts/verify-packaged-runtime.mjs <app-path> <installed-cli-path>` to verify desktop attachment to the installed Runtime with an isolated profile. Set `SHARKBAY_TEST_NODE` to the Node executable used to install the CLI.
