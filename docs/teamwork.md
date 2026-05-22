# SharkBay Teamwork

Teamwork lets local agents and humans share concise project work context through repo-local Markdown task files and a Git-backed team context branch.

## Current Implementation

Teamwork is installed per project from the `TEAM` detail tab. Installation:

1. Verifies the project is a Git worktree.
2. Resolves the current GitHub user through `gh api user`.
3. Requires a GitHub `origin` remote.
4. Checks that the user has `write` or `admin` permission.
5. Creates or fetches the `sharkbay-team-context` remote branch.
6. Writes the local `.sharkbay` harness files.
7. Starts immediate and periodic sync.

## Local Files

Installed Teamwork writes:

```text
repo/
  .git/
    info/
      exclude
  .sharkbay/
    machine-id
    harness/
      protocol.md
    tasks/
      <taskId>-<slug>.md
    team-context/
      tasks/
        <year>/
          <month>/
            <taskId>-<slug>.md
```

Only `.sharkbay/` is added to `.git/info/exclude` during install. Root agent entry files are not generated during install, are not special-cased in `.git/info/exclude`, and are not repaired during agent launch.

When a supported agent is launched from SharkBay and Teamwork is installed, SharkBay injects a first-message bootstrap prompt into the launch command. The bootstrap is phrased as the user's own working-context instruction and tells the agent to read `.sharkbay/harness/protocol.md` before further work. Supported launch adapters are:

- Codex: positional prompt
- Claude: positional prompt
- DeepSeek: positional prompt
- Gemini: `-i <prompt>`
- Qwen: `-i <prompt>`
- Kiro: `chat <prompt>`
- OpenCode: `--prompt <prompt>`

SharkBay does not silently rewrite installed harness files during agent launch. The `TEAM` tab compares managed harness files such as `.sharkbay/harness/protocol.md` and `.sharkbay/harness/agent-session-id.sh` with the current generated source. If a managed file is missing or changed, the `TEAM` tab shows a prompt above Knowledge Site; the user must click Update Harness before SharkBay overwrites or adds those files.

## Task Files

Agents maintain Markdown files under `.sharkbay/tasks/`. The harness protocol defines the required frontmatter and sections.

Required sections:

- `Summary`
- `Files`
- `Work`
- `Verification`
- `Notes`

Completed tasks include `status: completed`, `completedAt`, and a commit when the task produced one. SharkBay parses local tasks and mirrored team tasks into the `TEAM` tab.

## Sync Model

The shared context is a Git branch named `sharkbay-team-context`.

- Local completed tasks not already present in the remote context are copied to `.sharkbay-team-context/tasks/<year>/<month>/`.
- The sync loop fetches the branch, refreshes the local read-only mirror, finds pending completed local tasks, pushes them with retry on non-fast-forward errors, then refreshes the mirror again.
- The local mirror lives under `.sharkbay/team-context/` and should be treated as read-only.
- Active or pending local records take precedence over mirrored records with the same task id in the UI.

## UI Behavior

The `TEAM` tab shows:

- Teamwork status and errors.
- Install action when Teamwork is available but not installed.
- Task list with owner avatar, title, tag, owner, git-history-style created time, and status pill.
- Raw Markdown task detail for selected records.
- Automatic task list and selected task detail refresh while a project is open.

The project context menu can turn Teamwork off. If the authenticated GitHub user owns the repository, SharkBay can also delete the shared context branch during uninstall.

## Uninstall

Uninstall removes `.sharkbay/`, removes SharkBay's `/.sharkbay/` local exclude entry when SharkBay added it, and cleans up legacy SharkBay-managed entry blocks from older versions. User-owned root instruction content outside those blocks is preserved.

Optional team-context cleanup deletes the remote `sharkbay-team-context` branch and the local remote ref, but only for the repository owner.

## Agent Responsibilities

Agents do not need special APIs to participate. They read `.sharkbay/harness/protocol.md`, create/update task files under `.sharkbay/tasks/`, record verification, and mark tasks completed when ready for sync.

Agents must not edit `.sharkbay/team-context/` directly.
