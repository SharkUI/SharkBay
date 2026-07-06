# Release And Packaging

SharkBay packages with Electron Builder for macOS.

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

## Package Inputs

The Electron Builder config in `package.json` includes:

- `dist/renderer/**/*`
- `dist-electron/**/*`
- `package.json`
- `resources/` as extra resources

The package entry is `dist-electron/electron/main.js`.

## Native Modules

The PTY layer is provided by `@lydell/node-pty` (Node.js / Electron) or `bun-pty` (Bun). Both ship N-API prebuilt binaries via platform-specific optional packages, so no `electron-rebuild` step is required. Electron Builder unpacks `@lydell/node-pty` and its platform packages from ASAR.

## Resources

Runtime icons are read from `resources/` in development and from `process.resourcesPath/resources` in packaged builds. Current app themes use day, night, and morning icon variants.

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

## Release Checks

Before producing distributable artifacts:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run pack`
5. Smoke test the unpacked app with a temporary project folder
6. `npm run dist`

Local builds use ad-hoc signing unless signing and notarization credentials are configured.

## Known Packaging Note

`tsconfig.node.json` currently includes `tests/**/*.ts`, and Electron Builder includes all of `dist-electron/**/*`. Review packaged contents before a public release if compiled tests should be excluded.
