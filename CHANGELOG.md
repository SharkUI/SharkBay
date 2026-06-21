# Changelog

## [0.2.7] — 2026-06-21

### Added
- Task Artifact action: generate self-contained HTML artifacts from tasks and record them back into task files
- Task artifact and review indexes in the local knowledge site
- Remote repository cloning from the Add Project modal
- In-app Share button for local artifact and site HTML pages

### Changed
- Default appearance now uses the Morning theme and macOS packaging uses the Morning app icon
- Add Project and task detail views have tighter typography, layout, and dialog controls
- Browser column minimum width is now 360px for more stable embedded page layouts
- Task Share terminology has been renamed to Artifact, with synced task artifacts shown alongside local task records
- README now links to the SharkBay website

### Fixed
- Agent terminals stay pinned to the bottom briefly after prompt submission while CLI output redraws
- Share button icon is clearer and more legible

## [0.2.6] — 2026-06-18

### Added
- Read-only task review: right-click a task to launch a review agent session (using the task's own agent or another installed one) that writes its report to `.sharkbay/reviews/<taskTag>-<code>.md` without joining the task protocol

### Changed
- Codex launch option replaces the Skip approval toggle with YOLO mode (`--yolo`, bypassing approvals and sandbox) and warns to use an isolated environment

### Fixed
- Project icons resolve from monorepo workspace package directories (e.g. `web/public/icon.png`) instead of falling back to the default icon
- Stale persisted launch flags no longer offered by an agent are filtered out, fixing Codex rejecting conflicting approval flags

## [0.2.5] — 2026-06-15

### Added
- Git panel now shows GitHub open pull requests, open issues, and latest release when `gh` is installed and authenticated
- Island status-change sounds for agent completion and approval transitions
- General settings for separate agent completion and approval sound toggles, including preview buttons

### Changed
- CodeGraph indexing is now maintained automatically: unindexed local Git projects initialize on selection, and dirty worktree changes sync after a 5-minute debounce
- Repository details include the latest GitHub release tag when available

### Fixed
- Packaged app can find `gh` from GUI-launched PATHs and lets `gh` find `git`
- Dock click restores the hidden main window while the island window is still visible
- Clicking the island no longer surfaces the main window on macOS unless a session is explicitly selected
- Restored/resumed agent sessions pick the latest matching status for island and tab indicators
- Stopped agent state clears when the user interacts with the terminal or prompt input
- SharkBay shells opt out of the Kiro wrapper by exporting `PROCESS_LAUNCHED_BY_Q=1`

## [0.2.4] — 2026-06-10

### Added
- App update hint: check GitHub latest release on startup; show subtle bottom-left link when a newer version is available for 48+ hours

### Changed
- Delay auto-clear of stopped/approval state by 300s on tab/window focus; prompt input cancels the timer and clears immediately

## [0.2.3] — 2026-06-08

### Added
- Island overlay: macOS Dynamic Island–style floating notch displaying live agent session states
- Animated shark mark with glow ring driven by session state
- Per-session prompt history with persistence for agent sessions
- Appearance settings with Theme, Color Scheme (526 options), and Font sub-tabs
- CJK font support with system-installed font filtering
- shell:openExternal IPC for terminal URL context menu
- Harness bootstrap prompt appends system locale language instruction
- Detect Kiro approval state from terminal output
- CodeGraph cancellable job lifecycle with detached process groups
- Incremental transcript indexing via size+mtime skip for token usage

### Changed
- Rename session states: idle→stopped, attention→approval, awaiting→unknown
- Attention (red) glow animation speed increased by 100%
- Island expanded panel removes sessions header, count, and divider
- Font tab simplified to list + preview layout with keyboard navigation
- Filter Kiro sub-agent sessions from Sessions tab
- Project status pill derived from agent tab lights
- Prompt history max length increased from 200 to 10000 chars
- CodeGraph auto-init gated behind opt-in setting
- Disable dock badge and bounce notifications

### Fixed
- Island transparent areas pass through mouse events correctly
- Preserve attention/idle state when SharkBay loses window focus
- Prompt history persists on quit, uses hook session id for agent history
- Font preview uses local state for immediate rendering
- Deduplicate prompt history recording
- Pass hookSessionId through restore flow for immediate history load
- Re-resolve terminal mapping when session is re-restored
- Cancel CodeGraph jobs before killing core on app exit
- Active-tab auto-clear of stopped/approval state re-enabled

## [0.2.2] — 2026-06-05

### Added
- Cursor CLI support with detection, hook connector, bootstrap injection, session restore, and settings panel entry
- New Worktree project context-menu action for creating a branch worktree and registering it as a SharkBay project
- Terminal bottom input history with separate shell and shared agent history buckets per project
- Command+T shortcut for opening a new shell terminal tab in the current project
- Drag reordering for terminal tabs

### Changed
- Bottom prompt input forwards leading slash commands directly to active agent terminals
- Reduced spacing around the Projects sidebar header
- Removed legacy harness entry-block uninstall cleanup code

### Fixed
- IME composition Enter no longer submits the bottom prompt input
- Files panel refresh now preserves expanded folder children after create, delete, and rename operations
- Cursor hook mapping keeps before* hook events as tool-start activity
- `.deepseek/` local files are ignored and no longer tracked

## [0.2.1] — 2026-05-31

### Added
- Sessions detail panel for browsing and restoring agent sessions per project
- Hook-based agent status system (working/idle/attention indicators)
- Bottom prompt input bar for agent CLI terminals
- OpenCode hook connector via JS plugin
- Auto-derive session title from first meaningful user prompt
- Session model version display for Claude, Kiro, and Gemini
- Right-click context menu in file tree panel
- Init action prompts in Sessions, Git, and Files detail panels
- Protocol install without git; team sync gated on GitHub remote
- AGENTS.md bootstrap support for directing agents to project conventions
- GitHub avatar caching in localStorage

### Changed
- Rename DeepSeek to CodeWhale
- Require protocol file for bootstrap injection
- Remove agent CLI download shortcut
- Remove terminal status fallback

### Fixed
- Hook PID-based session→tab resolution replacing heuristic tab mapping
- Stable socket path to survive app restarts
- Stale session silent expiry instead of emitting idle
- Idle dot suppression on active tab
- Active tab idle excluded from project pill aggregation
- Tab focus clears idle dot correctly
- Per-session status dot on agent tabs
- Session-id injection skipped when command has --resume
- Terminal input bar growth no longer triggers terminal redraw
- Bottom input focus maintained on tab switch
- Codex hook config schema
- Kiro hooks installed into agent config instead of settings.json
- Kiro tools wildcard included in sharkbay agent config
- Gemini nested hook format and CodeWhale session restore match
- Session model label formatting
- Local-only install identity resolution preventing harness drift
- .sharkbay exclude entry added when git appears after protocol install

## [0.2.0] — 2026-05-28

### Added
- Dock badge count and bounce for projects needing attention
- `--trust-all-tools` launch option for Kiro CLI

### Changed
- Rename Teamwork to Task Protocol across documentation and source

### Removed
- Remote machine (SSH) functionality
- Stack detail panel and unused profiles IPC bridge

### Fixed
- Startup flash: defer window.show, parallelize scan, fix terminal toolbar layout

## [0.1.1] — 2026-05-28

### Added
- CodeGraph project indexing support with init, PATH handling, and gitignore management
- Token usage tracking with SQLite storage and detail window
- Agent CLIs settings panel with install, launch options, and permission flags
- Task session restore affordance
- DeepSeek, Kiro, Qwen, and OpenCode session id support

### Changed
- Switch PTY to @lydell/node-pty with Bun runtime fallback
- Upgrade command-path resolver to load PATH from user's login shell
- Redesign settings to Codex-style layout with SVG theme cards
- Rename bundled plugin metadata
- Release under GPLv3

### Fixed
- BrowserView bounds under zoom
- nvm command discovery (PR #11)
- Token usage cache accounting
- Restored session id lookup
- Agent launch: quote command path separately from flags
- Renderer minification crash with xterm.js
- opencode launch with delayedBootstrapPrompt

## [0.1.0] — 2026-05-09

Initial public release. macOS workbench for multi-agent vibe coding with support for Claude Code, Codex, Gemini, Kiro, DeepSeek, Qwen, and OpenCode.
