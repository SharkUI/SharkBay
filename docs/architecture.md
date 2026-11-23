# Architecture

The [current facts table](current-facts.md) records the canonical product and runtime contract.

SharkBay has one independent Node application runtime, a shared React workbench, and Electron/browser clients. GitHub remains the only identity, permission, and collaboration system.

## Process Model

- `electron/main.ts` creates the main `BrowserWindow`, loads the Vite dev server in development, and loads `dist/renderer/index.html` in packaged builds.
- `electron/preload.mts` exposes the constrained `window.sharkBay` bridge.
- `electron/ipc.ts` forwards business commands to the existing runtime over a user-private local socket. BrowserView, dialogs, sharing and desktop power controls remain in Electron.
- `electron/runtime-client.ts` discovers and connects to the local runtime. The development launcher can start a source runtime. Desktop shutdown disconnects the client; runtime-owned PTYs and watchers continue.
- `src/server/main.ts` owns profile locking, initialization and shutdown; `http-server.ts` serves the workbench and authenticated HTTP/WS.
- `src/runtime/application-runtime.ts` owns Core, tasks, Hooks, Review/Artifact, Telegram and usage. Only this process writes their state.
- `src/runtime/control-server.ts` exposes owner-only local administration and the same application commands to Electron. Protocol handshake and profile locking prevent two owners; browser network commands cannot register arbitrary host projects.
- `src/renderer/main.tsx` renders `App` into `index.html`.
- `src/renderer/App.tsx` contains the current UI shell and most renderer components.

The main window runs with context isolation enabled and node integration disabled. The preload bridge is the renderer's only direct path into desktop capabilities. Browser clients instead use `src/renderer/bridge/web-bridge.ts`; both transports execute the same validated application contract. Desktop IPC channel names remain in `ipc-channels.ts`; public runtime commands/events live in `application-api.ts` and `application-events.ts`.

## IPC Surface

Canonical channel names live in `src/shared/ipc-channels.ts`. The exposed groups are:

- `config:*` - configured project add/remove/list operations, folder picker, and appearance theme.
- `projects:*` - scan, project detail, and file tree.
- `terminal:*` - PTY lifecycle, input, resize, data, updates, and exits.
- `browser:*` - embedded BrowserView lifecycle, navigation, resize, and updates.
- `agents:*` - available agent CLI list and transcript-derived status events.
- `protocol:*` - tasks, status, install, enable, uninstall, identity, sync, and task-change events.

Renderer-facing data types are mirrored in `src/renderer/types.ts`; stricter shared contracts live in `src/shared/types.ts`.

## Main-Process Modules

| Module | Responsibility |
| --- | --- |
| `src/main/config.ts` | Load/save normalized app config. |
| `src/main/json-file.ts` | Atomic JSON reads/writes with revisions. |
| `src/main/path-safety.ts` | Resolve configured projects and enforce path containment. |
| `src/main/scanner.ts` | Resolve manually configured projects into project candidates. |
| `src/main/git.ts` | Read Git metadata, reflog history, and dirty files. |
| `src/main/project-files.ts` | Return safe lazy file-tree entries and editable-file flags. |
| `src/main/project-icons.ts` | Resolve local project icon candidates and favicon fallbacks. |
| `src/main/dev-services.ts` | Discover runnable development services. |
| `src/main/terminal.ts` | Manage PTY sessions and terminal titles. |
| `src/main/pty.ts` | Ordinary Node PTY facade (`@lydell/node-pty`); Electron does not load PTY or SQLite modules. |
| `src/main/browser-tabs.ts` | Manage embedded Electron `BrowserView` tabs. |
| `src/main/agent-clis.ts` | Discover agent CLIs and watch Codex/Claude transcript status. |
| `src/main/harness.ts, tasks.ts, teamwork-sync.ts` | Install protocol harness, parse tasks, and sync context records. |

## Renderer Structure

The renderer currently uses React hooks rather than a separate state library.

- `App` owns global state: view, configured projects, project candidates, selected project, detail data, loading/errors, refresh time, and theme.
- `DashboardView` builds the three-column workbench: project list, terminal/browser workspace, and detail pane.
- `TerminalPane` owns per-project terminal/browser tab state.
- `ProjectDetailPane` owns `TASKS`, `Git`, and `Files` tabs.
- `SettingsView` owns project, status, and appearance settings.
- `src/renderer/workflow.ts` contains pure workflow helpers with focused unit tests.
- `src/styles/app.css` is the single global stylesheet and implements all current themes.

## Runtime Data

- Shared profile: `~/.sharkbay/runtime/`, optionally selected with `SHARKBAY_RUNTIME_DATA_DIR` or runtime CLI `--data-dir`. Config and data locks have one owner.
- The default config is copied from the existing helper config on first start; `--config`/`SHARKBAY_CONFIG_PATH` can select an existing explicit config.
- Browser/Electron refresh enumerates runtime sessions and attaches complete headless terminal snapshots. It never launches replacement Agents automatically.
- A single client controls each PTY; other clients observe and can explicitly take over. Runtime stop ends PTYs; closing/crashing a client does not.
- Legacy/helper config default: `~/.sharkbay/config.json` when config helpers are called outside Electron runtime.
- Renderer layout state: `localStorage` keys for project/detail column widths.
- Browser session storage: Electron partition `persist:sharkbay-browser`.
- Protocol local state: `.sharkbay/` and `/.sharkbay/` in `.git/info/exclude`; supported agent launches get a first-message bootstrap prompt instead of generated entry files.
- Protocol shared state: remote branch `sharkbay-team-context`, mirrored locally under `.sharkbay/team-context/`.
- Agent status sources: recent local files under `~/.codex/sessions` and `~/.claude/projects`.

### Startup resource boundaries

- Opening projects and observing file changes only read CodeGraph status. Index creation/sync requires the Files panel's **Build index** / **Sync index** action; no automatic indexing is scheduled.
- Transcript polling and usage backfill read JSONL in 64 KiB chunks, one file at a time per reader. Partial records retain their byte positions; incomplete or cancelled backfills are not marked fully scanned. Records above 4 MiB are skipped with a diagnostic warning. Kiro's single-document JSON is capped at 16 MiB before parsing; larger documents remain unindexed with a warning. These limits protect startup memory, and can leave usage statistics incomplete for oversized records.
- Profile/config locks are reclaimed only after a valid recorded PID is confirmed absent (`ESRCH`). Concurrent recovery is serialized; live owners, permission failures, malformed locks, and an existing recovery guard fail closed. A PID reused by another process is treated as live. An interrupted recovery guard requires manual verification rather than automatic deletion.

## Path And Execution Safety

Path safety is enforced in the shared runtime. Renderer-supplied paths are re-resolved against persisted configured projects before filesystem, Git, file-tree, terminal, or Protocol operations run.

Key boundaries:

- Product entry points call `resolveRepoPath` with persisted configured projects, so directories must be inside a manually configured project.
- File listing and the built-in CodeMirror editor use the same runtime path boundary; file reads and writes additionally validate size and content.
- Managed `.sharkbay` protocol, mirror and artifact paths reject symlinks in existing path components. Managed writes open the final file without following symlinks, reject multiple hard links and use the open handle for truncation and permissions. Task IDs must be safe filename identifiers before parsing or reserving outputs. These checks are not a filesystem transaction against concurrent replacement of ancestor directories by another process.
- Git metadata paths come from `git rev-parse --git-path`, so linked worktrees can use their legitimate shared Git directory. Context sync uses a unique private temporary index and removes it after each operation; it does not write through a guessed `<worktree>/.git` directory or change the user's index.
- terminal cwd is resolved through the same allowed-project boundary.
- BrowserView URL normalization supports HTTP(S) and local file previews; browser network APIs require authenticated sessions. HTTP/WS access on loopback and LAN requires the same host-issued grant/cookie flow as other addresses. Revoke invalidates all sessions and grants and closes their connections.
- Teamwork launch bootstrap is prepared in the runtime after cwd safety checks and Teamwork install detection.
- Teamwork context cleanup is restricted to the repository owner.

## External Commands

SharkBay shells out to local tools for user-visible project workflows:

- `git` for repository status, history, sync, and Teamwork context transport.
- `gh` for Teamwork identity and repository permission checks.
- `lsof` on macOS for terminal cwd/title inspection.
- The configured login shell supplies PATH; command discovery checks that PATH plus known fallback and version-manager directories. Fish joins its PATH into a single colon-separated line.
- User shells through `@lydell/node-pty` for terminal tabs and service commands. The current runtime does not select bun-pty.

## Packaging

- The package entry is `dist-electron/electron/main.js`.
- `npm run build` separately builds the ordinary Node runtime, Electron client and shared renderer. Runtime import-graph checks reject Electron dependencies.
- Vite uses `base: "./"` so packaged `file://` renderer assets resolve correctly.
- Electron Builder includes `dist/renderer`, `dist-electron`, `package.json`, and `resources/`.
- `npm run prepare:runtime` stages the current ordinary Node binary, Node license, production dependencies, runtime and renderer outside ASAR; Electron Builder includes this directory as `Resources/runtime`.
- Electron native dependency rebuilding is disabled: SQLite/PTY belong to the bundled Node environment. Build on the target OS/architecture; do not copy a development `node_modules` across platforms.

Tests remain part of TypeScript checking, but package rules exclude compiled tests, source maps, declarations and build metadata. Verify the actual package manifest before a release.

## Tests

Vitest tests cover main-process helpers and pure renderer workflow behavior, including scanner, Git parsing, path safety, terminal logic, browser URL normalization, Teamwork harness/sync/tasks, IPC channels, and build config. There is no broad React DOM/component test suite yet.

The integration boundary and acceptance plan are recorded in [Shared runtime plan](shared-runtime-plan.md).

## Plugin and Profile Scope

Bundled plugins register in code; no installed-plugin filesystem scan or third-party executable loading is connected. Machine profiles supply installation preconditions and support cached detector results; the current Agent-list shortcut performs enabled CLI detection directly. Project profile APIs have no current application/UI consumer. The [historical profiles proposal](execution-target-profiles.md) is not an implementation tracker for unsupported targets or marketplace features.
