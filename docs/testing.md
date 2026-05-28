# Testing

SharkBay uses Vitest for the current automated test suite.

## Command

```bash
npm test
```

Vitest runs in the `node` environment and includes `tests/**/*.test.ts`.

## Current Coverage Areas

- IPC channel contract
- app menu behavior
- build config for packaged renderer assets
- manual project resolution and path safety
- Git status/history parsing
- project file tree safety and editable-file detection
- development service discovery
- terminal command/title/input behavior
- embedded browser URL normalization
- agent CLI discovery and transcript status parsing
- Protocol harness install/uninstall
- Task parsing and context sync
- renderer workflow pure helpers

## Coverage Gaps

- There is no broad React DOM/component test suite yet.
- BrowserView behavior is mostly covered through URL normalization and main-process unit boundaries, not full Electron integration.
- Packaging is checked through build config and manual pack/dist smoke tests, not automated installed-app tests.

## Coverage Output

Vitest coverage is configured to write text and HTML reports to `coverage/` when coverage is requested.

## Suggested Verification By Change Type

- Main process logic: run the targeted unit test and `npm run typecheck`.
- IPC changes: update channel constants, preload bridge, renderer types, and `tests/ipc-channels.test.ts`.
- Renderer workflow helpers: update `tests/renderer-workflow.test.ts`.
- Protocol changes: run harness, task, and sync tests.
- Docs-only changes: inspect rendered Markdown where useful and run `git diff --check`.
