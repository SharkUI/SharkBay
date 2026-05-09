# Roadmap

## 1. Strategy

SharkBay should become a local-first project workbench, not a dashboard of implementation files. The user should first see projects, status, current work, links, and next actions. Low-frequency setup, roots, and protocol details should live in Settings or secondary detail views.

## 2. Phases

| Phase | Goal | Deliverables | Gate |
| --- | --- | --- | --- |
| 0 | Establish local macOS app foundation | Electron/React app, safe scan roots, project detail, and project terminals | Typecheck, tests, build, and dogfood scan pass |
| 1 | Make the UI project-centered | Projects/Settings IA, project list, Git and Files detail pane | User can understand what projects exist and what changed without reading protocol files |
| 2 | Discover ordinary local projects | Root Git repository discovery, project icons, dev service detection | User can see local repositories under configured roots |
| 3 | Add runtime and repository operations | GitHub metadata, local dev server status, start/stop/restart actions, deployment commands | Operations are explicit, reversible where possible, and visibly logged |

## 3. Milestones

| Milestone | Target | Exit Criteria |
| --- | --- | --- |
| Project workbench v0 | Completed 2026-05-05 | Projects is primary; roots/create live in Settings; full tests and build pass |
| Generic Git project discovery | Next | Scan roots show Git repositories, icons, dirty files, file trees, and dev services |

## 4. Dependencies

```text
t-001 foundation
  -> t-002 self-hosting UX
    -> t-003 dogfood fixes
      -> t-004 project-centered UI
        -> generic Git project discovery
        -> runtime/GitHub/deployment operations
```
