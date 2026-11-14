# Architecture

SharkBay has one independent Node application runtime, a shared React workbench, and Electron/browser clients. GitHub remains the only identity, permission, and collaboration system.

## Process Model

- `electron/main.ts` creates the main `BrowserWindow`, loads the Vite dev server in development, and loads `dist/renderer/index.html` in packaged builds.
- `electron/preload.mts` exposes the constrained `window.sharkBay` bridge.
- `electron/ipc.ts` forwards business commands to the existing runtime over a user-private local socket. BrowserView, dialogs, sharing and desktop power controls remain in Electron.
- `electron/runtime-client.ts` discovers the runtime or starts the bundled ordinary Node executable. Desktop shutdown disconnects the client; it does not stop runtime-owned PTYs or watchers.
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

## Path And Execution Safety

Path safety is enforced in the shared runtime. Renderer-supplied paths are re-resolved against persisted configured projects before filesystem, Git, file-tree, terminal, or Protocol operations run.

Key boundaries:

- Product entry points call `resolveRepoPath` with persisted configured projects, so directories must be inside a manually configured project.
- file tree listing rejects unsafe directory paths and only marks contained, known text-like files as editable.
- terminal cwd is resolved through the same allowed-project boundary.
- BrowserView navigation accepts only `http:` and `https:` URLs; invalid or unsafe schemes become `about:blank`.
- Teamwork launch bootstrap is prepared in the runtime after cwd safety checks and Teamwork install detection.
- Teamwork context cleanup is restricted to the repository owner.

## External Commands

SharkBay shells out to local tools for user-visible project workflows:

- `git` for repository status, history, sync, and Teamwork context transport.
- `gh` for Teamwork identity and repository permission checks.
- `lsof` on macOS for terminal cwd/title inspection.
- `/bin/zsh -lc command -v ...` and fallback paths for CLI discovery.
- user shells through `@lydell/node-pty` (or `bun-pty` under Bun) for terminal tabs and service commands.

## Packaging

- The package entry is `dist-electron/electron/main.js`.
- `npm run build` separately builds the ordinary Node runtime, Electron client and shared renderer. Runtime import-graph checks reject Electron dependencies.
- Vite uses `base: "./"` so packaged `file://` renderer assets resolve correctly.
- Electron Builder includes `dist/renderer`, `dist-electron`, `package.json`, and `resources/`.
- `npm run prepare:runtime` stages the current ordinary Node binary, Node license, production dependencies, runtime and renderer outside ASAR; Electron Builder includes this directory as `Resources/runtime`.
- Electron native dependency rebuilding is disabled: SQLite/PTY belong to the bundled Node environment. Build on the target OS/architecture; do not copy a development `node_modules` across platforms.

`tsconfig.node.json` currently includes tests in the Node build output. Review packaged contents before release if artifact size or source exposure matters.

## Tests

Vitest tests cover main-process helpers and pure renderer workflow behavior, including scanner, Git parsing, path safety, terminal logic, browser URL normalization, Teamwork harness/sync/tasks, IPC channels, and build config. There is no broad React DOM/component test suite yet.

The integration boundary and acceptance plan are recorded in [Shared runtime plan](shared-runtime-plan.md).
