# Documentation

This directory documents the current SharkBay implementation.

## Primary Docs

- [Product notes](product.md) - what the app does, current workflows, and product boundaries.
- [Architecture](architecture.md) - Electron process model, IPC, modules, storage, safety, and packaging.
- [Development guide](development.md) - setup, commands, tests, packaging, and local runtime notes.
- [Testing](testing.md) - current test scope, commands, and coverage gaps.
- [Release and packaging](release.md) - build outputs, Electron Builder config, native modules, and release checks.
- [Task Protocol](tasks.md) - SharkBay protocol harness, task files, sync, and uninstall behavior.
- [Agent guide](agents.md) - repository-specific instructions for automation agents and contributors.
- [Roadmap](roadmap.md) - current baseline and next priorities.

## Shared Design References

The `docs/shared/` HTML files are retained as design references. They are not the source of truth for current behavior:

- `docs/shared/tasks-design.html` - historical task protocol design proposal, partly implemented and partly superseded.
- `docs/shared/tasks-ui-mockup.html` - static UI mockup that reuses production CSS for visual reference.

When docs and code disagree, treat code and tests as authoritative, then update the docs.
