# Testing

SharkBay uses Vitest with a Node test environment. The default suite includes `tests/**/*.test.{ts,tsx}`, runs files without parallelism and uses one worker. See [Current implementation facts](current-facts.md) for the runtime and product boundaries.

## Execution layers

| Command | Scope | Effects and prerequisites |
| --- | --- | --- |
| `npm test` | Isolated component and logic tests | Fake external APIs/providers, owned temporary files and SQLite, real React test renderer, controlled child Node/socket and local Git fixtures where explicitly tested. No complete ApplicationRuntime or Electron launch, real Agent invocation or index build. |
| `npm run test:host` | `terminal.test.ts`, `harness.test.ts`, `agent-clis.test.ts` | Explicit opt-in: real login shells/PTY, local commands and host PATH discovery. Review environment and fixtures before running. These are excluded from the default suite. |
| `npm run test:integration` | `web-runtime-integration.test.ts` | Explicit opt-in: starts complete ApplicationRuntime, HTTP/WS and control servers and real PTYs. Requires an isolated host/profile and the relevant authorization; this layer was not run during the current fixes. |

The corresponding configurations are `vitest.config.ts`, `vitest.host.config.ts` and `vitest.integration.config.ts`. The integration and host configurations override the default file list rather than silently enabling every test. Selecting a filename excluded from the default configuration does not run it; select its opt-in configuration explicitly.

Builds and `verify:webui`, `verify:shared` or `scripts/verify-packaged-runtime.mjs` are separate checks. The verification scripts may start services, desktop clients and browsers; passing `npm test` does not imply those checks were executed.

## Isolation and cleanup

- Use `makeTempRoot` / `makeTestRuntime` in `tests/helpers.ts` for owned temporary directories. They register each root for shared afterEach cleanup. `createGitRepoFixture` creates an empty `.git` marker suitable for filesystem/profile tests; use actual temporary Git initialization for Git/worktree behavior.
- Hooks run in stack order: a file's afterEach disposes its managers, databases, watchers, sockets and children before the shared fixture hook removes directories. Cleanup must also cover failed assertions and initialization errors.
- Flush or cancel prompt-store timers before deleting their directories. Do not wait a fixed sleep to hide pending writes. Unique paths do not replace lifecycle cleanup.
- Inject Agent session roots, command resolvers, providers and network clients. Creating a temporary config alone does not prevent discovery of real user sessions or shell initialization.
- Never run real indexers, model requests, production bot messages or deployment operations as a default test side effect.

`fixture-cleanup.test.ts` verifies both root ownership and the disposal-before-removal hook order. Prompt-store tests use fake time and verify that delayed writes do not recreate a removed fixture. Reasonix status tests use owned fixture paths instead of a shared `/tmp` project.

## Current verification coverage

- IPC/application contracts, path containment, symlink boundaries, local Git parsing and worktree/protocol behavior.
- Agent status identity, explicit outcome and lifecycle evidence, duplicate/late events, asynchronous questions, child work and coalesced notifications.
- Incremental transcript reading, UTF-8 offsets, partial writes, cancellation, failure retry and bounded retention.
- Resource scheduling, cancellation, timeout, per-target concurrency, provider/profile cache and plugin invalidation with injected execution boundaries.
- File creation preserving existing data, rename/delete boundaries and permitted editing.
- Telegram approval ownership, exclusive remote takeover, per-user/message selection, poll cancellation, token rotation, background rejection handling and bounded output, using fake APIs and terminals.
- A real React `CodeGraphPanel` mount, rerender/project changes, manual button action, loading/retry and stale results. These replace the former text-only `useEffect` check. A controlled mutation adding indirect automatic maintenance was rejected by the no-automatic-indexing test, then the source was restored and the component suite passed.
- Temporary real SQLite migration/reopen, unique source offsets, file scan metadata, transactional rollback and SQL aggregation compared with provider token formulas.
- Build configuration, resource copying and other explicitly scoped artifact checks. Config assertions are separate from an actual signed artifact and installation acceptance.

## Remaining integration checks

There is no broad DOM/layout or installed-app suite. React test renderer verifies real component lifecycle and button behavior without a real browser, Electron or xterm surface. Native BrowserView navigation, focus, GPU/layout, mobile keyboard, real Agent protocol compatibility, complete runtime recovery and installed signed updates still require their own acceptance environment.

The opt-in full-runtime integration fixture now exchanges a one-time connection grant, retains the returned session cookie for HTTP and WS, checks authorization revocation, and reconnects with a fresh grant. It is type-checked but was not executed during these fixes; no deployed application or 103 was updated.

## Targeted checks

Run reviewed files with the relevant configuration, for example:

```bash
./node_modules/.bin/vitest run tests/codegraph-manual-index.test.tsx tests/token-usage-db.test.ts --maxWorkers=1
./node_modules/.bin/vitest run --config vitest.host.config.ts tests/harness.test.ts --testNamePattern 'uses agent-specific bootstrap command arguments' --maxWorkers=1
npm run typecheck
```

The host example uses controlled temporary Git files and checks generated launch arguments; running the entire host suite has broader side effects. Choose checks according to the changed behavior. For documentation-only changes, validate links and run `git diff --check`.
