# Task Protocol Helper Design

This document sketches a revised SharkBay task protocol template. It is a design draft only; it does not describe the current implementation.

## Goals

- Keep `AGENTS.md` as a neutral entry file shared by multiple AI CLIs.
- Record the real agent identity on each task, not at project level.
- Record both `agent` and `agentVersion` in task frontmatter.
- Prefer a local helper for task file authoring so agents do not hand-build required frontmatter.
- Preserve the existing Markdown task-file model so tasks remain readable and editable without special infrastructure.
- Support multiple AI CLIs running in the same project at the same time.

## Non-Goals

- Do not make `AGENTS.md` Codex-specific.
- Do not store a single active agent in `.sharkbay/harness/protocol.md`.
- Do not require MCP support from every agent CLI.
- Do not make task records opaque database rows; Markdown remains the source of truth.

## Identity Model

Agent identity is scoped to the task authoring process, not the project.

When SharkBay launches an agent CLI, it can inject process-local environment variables:

```sh
SHARKBAY_AGENT_ID=codex
SHARKBAY_AGENT_VERSION="codex-cli 0.130.0"
```

Another terminal in the same project can run with different values:

```sh
SHARKBAY_AGENT_ID=claude
SHARKBAY_AGENT_VERSION="claude-code 1.2.3"
```

Because environment variables belong to each spawned process, simultaneous CLIs in one worktree do not conflict.

## Task Frontmatter

Every task record should include a non-empty `agent` and `agentVersion`:

```yaml
---
kind: sharkbay_task
taskId: A7K3P9-u3960864-m81ae10
taskTag: A7K3P9
mode: task
title: Fix TEAM refresh
status: active
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: codex
agentVersion: codex-cli 0.130.0
createdAt: 2026-05-17T04:30:00Z
updatedAt: 2026-05-17T04:30:00Z
---
```

`agent` is a stable tool id, such as `codex`, `claude`, `gemini`, `kiro`, `qwen`, `opencode`, or `unknown`.

`agentVersion` is the exact runtime version string available when the task is created. If the version cannot be detected, use `unknown`, but the field should still be present.

## Helper-First Authoring

The protocol should tell agents to use a generated local helper whenever it exists:

```sh
test -x .sharkbay/harness/task
```

Start a task:

```sh
.sharkbay/harness/task start --title "Fix TEAM refresh" --mode task
```

Update changed files:

```sh
.sharkbay/harness/task update --task A7K3P9-u3960864-m81ae10 --file src/renderer/App.tsx
```

Append work notes:

```sh
.sharkbay/harness/task update --task A7K3P9-u3960864-m81ae10 --work "Derived task detail from the latest task list."
```

Record verification:

```sh
.sharkbay/harness/task update --task A7K3P9-u3960864-m81ae10 --verification "npm test"
```

Complete a task:

```sh
.sharkbay/harness/task complete --task A7K3P9-u3960864-m81ae10 --commit 208b799b
```

The helper should print the task id and path after `start`. A `--json` option is useful for agents that can consume structured output.

## Helper Responsibilities

The helper owns the structured parts of task records:

- Generate `taskTag`, `taskId`, and filename.
- Fill `actor`, `githubUserId`, `machine`, `agent`, `agentVersion`, `createdAt`, and `updatedAt`.
- Refuse to create a task with an empty `agent`.
- Fill `agentVersion` from `SHARKBAY_AGENT_VERSION`, helper detection, or `unknown`.
- Preserve valid frontmatter when updating an existing task.
- Keep all writes under `.sharkbay/tasks/`.
- Avoid editing `.sharkbay/team-context/`, which remains read-only.

Agents still provide human content: title, summary, file list, work notes, verification notes, and future-agent notes.

## Identity Resolution

For `agent`, the helper should resolve identity in this order:

1. `--agent <id>` explicit argument.
2. `SHARKBAY_AGENT_ID` from the current process environment.
3. A known CLI marker if SharkBay can reliably provide one.
4. Fail and ask the agent/user to provide `--agent`.

For `agentVersion`, the helper should resolve version in this order:

1. `--agent-version <version>` explicit argument.
2. `SHARKBAY_AGENT_VERSION` from the current process environment.
3. A helper-managed version probe for known agent ids.
4. `unknown`.

The helper should not infer agent identity from `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or any other static adapter file.

## Protocol Template Draft

The generated `.sharkbay/harness/protocol.md` can use this shape:

````md
# SharkBay Harness Protocol

Project:
- Repo: <repo>
- GitHub login: <githubLogin>
- GitHub user id: <githubUserId>
- Machine id: <machineId>
- Local tasks: .sharkbay/tasks/
- Team context mirror: .sharkbay/team-context/
- Team context branch: sharkbay-team-context

## Agent Responsibility

You maintain SharkBay task records for persistent project-changing work.
Use the local task helper when available. SharkBay reads and displays the task
Markdown files that the helper creates.

## Current Agent Identity

Task records must include:
- agent: the current agent CLI id, for example codex, claude, gemini, kiro, qwen, opencode
- agentVersion: the current agent CLI version string, or unknown if unavailable

Do not infer agent identity from AGENTS.md or any other static adapter file.
Do not store a project-wide active agent in this protocol file.

When SharkBay launches an agent CLI, it may provide:
- SHARKBAY_AGENT_ID
- SHARKBAY_AGENT_VERSION

These values are per process, so multiple CLIs may work in the same project at
the same time.

## Task Authoring

Before making persistent project changes, create or update one task file per
logical unit of work.

Prefer the helper:

```sh
test -x .sharkbay/harness/task
```

Start:

```sh
.sharkbay/harness/task start --title "<title>" --mode task
```

Update:

```sh
.sharkbay/harness/task update --task <taskId> --file <path>
.sharkbay/harness/task update --task <taskId> --summary "<summary>"
.sharkbay/harness/task update --task <taskId> --work "<work note>"
.sharkbay/harness/task update --task <taskId> --verification "<verification>"
.sharkbay/harness/task update --task <taskId> --notes "<future-agent note>"
```

Complete:

```sh
.sharkbay/harness/task complete --task <taskId> --commit <commit>
```

If the helper is missing, create or update the Markdown file manually using the
required frontmatter below. Manual task records still require non-empty agent and
agentVersion fields.

## Required Frontmatter

```yaml
---
kind: sharkbay_task
taskId: A7K3P9-u<githubUserId>-m<machineId>
taskTag: A7K3P9
mode: task
title: Update teamwork design
status: active
actor: <githubLogin>
githubUserId: <githubUserId>
machine: <machineId>
agent: <currentAgentId>
agentVersion: <currentAgentVersion>
createdAt: 2026-05-17T04:30:00Z
updatedAt: 2026-05-17T04:30:00Z
---
```

## Required Sections

## Summary
One or two sentences describing the task outcome.

## Files
- path/to/changed-file

## Work
- Concise bullet describing meaningful work.

## Verification
- Command, check, review, or reason verification was not run.

## Notes
- Context useful to future agents.
````

## Validation

SharkBay UI and sync should treat missing identity as a record quality problem:

- Empty `agent` means unsigned.
- Missing `agentVersion` means unversioned.
- Unsigned or unversioned tasks can still be readable, but should be visibly flagged.
- Sync can allow them during migration, then become stricter once helper adoption is stable.

## Migration Notes

Existing task files with empty `agent` should be backfilled only when there is reliable provenance. Do not blindly rewrite every empty task as `codex`.

Possible provenance sources:

- The session that created the task.
- A SharkBay terminal launch record.
- User confirmation.
- A commit or task note that names the agent.

If provenance is unknown, use `agent: unknown` and `agentVersion: unknown`, or leave the record flagged for manual correction.
