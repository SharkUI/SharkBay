# Product Notes

SharkBay is a local-first project workbench for macOS. It is built for developers who keep multiple local repositories active and want one place to see repository state, open terminals, launch development services, inspect files, use local agent CLIs, and coordinate task context.

## Current Product Surface

- **Projects**: manually add project directories and remove them from the workspace.
- **Project list**: show repository icon, name, path or agent status, dirty state, running services, and terminal activity.
- **Terminal workspace**: keep per-project terminal tabs alive while switching projects and Settings.
- **Development services**: expose detected `dev` and `dev:*` commands as service pills.
- **Browser tabs**: open web URLs in embedded project browser tabs.
- **TASKS tab**: show protocol status, install protocol, list task records, and inspect raw Markdown task details.
- **Git tab**: show repository facts, dirty files, and recent reflog history.
- **Files tab**: lazily browse project files and open editable files in a terminal editor.
- **Settings**: manage configured projects, project status, and appearance theme.

## Project Discovery

SharkBay supports one project source: exact directories selected by the user. Configured projects are resolved, enriched with local metadata, and sorted by project name. Removing a project from the left project-card context menu or Settings removes only the SharkBay workspace entry, after confirmation.

## Task Protocol

Task Protocol is opt-in per project. Installing it adds a repo-local `.sharkbay` harness and enables task-file sync through the remote `sharkbay-team-context` branch when GitHub permissions allow it. When SharkBay launches a supported agent, it injects a first-message bootstrap prompt that tells the agent to read `.sharkbay/harness/protocol.md`; it does not generate or repair per-agent entry files during launch.

Task Protocol does not replace Git commits or code review. It gives humans and agents a compact local record of current work, verification, files touched, and future context.

## Product Boundaries

- SharkBay is a desktop app, not a web service.
- It is desktop-first and currently has an `1180px` minimum window width.
- It only operates on user-configured projects.
- It does not run agents invisibly; agent CLIs launch in visible terminal tabs.
- It does not sync repository data unless a feature explicitly requires it, such as task protocol.
- It does not provide a full IDE editor. File actions open terminal-based editor/diff commands.
