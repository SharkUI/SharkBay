# Documentation

This directory documents the current SharkBay implementation.

## Primary Docs

- [Current facts](current-facts.md) - canonical product, process, storage, security and release behavior; distinguishes current capabilities from proposals.

- [Product notes](product.md) - what the app does, current workflows, and product boundaries.
- [Architecture](architecture.md) - Electron process model, IPC, modules, storage, safety, and packaging.
- [Development guide](development.md) - setup, commands, tests, packaging, and local runtime notes.
- [Testing](testing.md) - current test scope, commands, and coverage gaps.
- [Audit plan](audit-plan.md) - engineering audit scope, isolation rules, evidence, cleanup review, and acceptance criteria.
- [Audit report for 2fc9c93](audit/2026-11-17/report.md) - findings, verification evidence, quality assessment, and remediation priorities for the fixed commit.
- [Release and packaging](release.md) - build outputs, Electron Builder config, native modules, and release checks.
- [Task Protocol](tasks.md) - SharkBay protocol harness, task files, sync, and uninstall behavior.
- [Agent guide](agents.md) - repository-specific instructions for automation agents and contributors.
- [Roadmap](roadmap.md) - current baseline and next priorities.

## Shared Design References

The `docs/shared/` HTML files are retained as design references. They are not the source of truth for current behavior:

- `docs/shared/tasks-design.html` - historical task protocol design proposal, partly implemented and partly superseded.
- `docs/shared/tasks-ui-mockup.html` - static UI mockup that reuses production CSS for visual reference.

Repository instructions and explicit product decisions define intended behavior. Source, tests and runtime evidence establish actual behavior. Record conflicts and correct the implementation, tests or documentation according to the intended contract; code and tests are not automatically authoritative over product constraints. See [current facts](current-facts.md).

## Historical Proposals

- [Execution target profiles](execution-target-profiles.md) - historical provider/profile/plugin design with a current status table; unimplemented targets and third-party loading are proposals.
- [Workspace model](workspace-model.md) - historical workspace design, not a current implementation contract.
- [Workspace agent platform](workspace-agent-platform.md) - historical platform proposal, subject to current product boundaries.
