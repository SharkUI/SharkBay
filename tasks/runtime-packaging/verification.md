# Runtime dependency packaging fix

The installed app failed with `ERR_MODULE_NOT_FOUND` for `@xterm/headless`.
Its `Contents/Resources/runtime/node_modules` directory was absent even though
the staged runtime contained production dependencies. Electron Builder skips
the root `node_modules` when copying a resource directory. A separate mapping
now copies its contents into `runtime/node_modules`.

Verified on 2026-11-14:

- `npm run typecheck` — exit 0.
- `npx vitest run tests/runtime-packaging.test.ts tests/web-runtime-integration.test.ts tests/web-runtime-security.test.ts` — exit 0, 17 tests passed. Runtime integration needs local socket access; the restricted run returned EPERM and was rerun with that access.
- `npm run pack` — exit 0; generated `release/mac-arm64/SharkBay.app` with an ad-hoc signature, without notarization. Dependency installation needed network access.
- `node scripts/verify-packaged-runtime.mjs` — exit 0 with local process/socket access. `PACKAGED_RUNTIME_OK bundled Node auto-start, SQLite/config, static WebUI, actual PTY, desktop termination survival, explicit shutdown`.

The app smoke test used a temporary profile and project and cleaned them up.
The installed `/Applications/SharkBay.app` was not modified.
