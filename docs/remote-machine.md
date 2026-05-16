# Remote Machine Support

## 1. Goal

Remote machine support should ship first at the project level. The first implementation does not need the workspace model.

For the follow-up provider/profile architecture, see [Execution Target and Project Profiles](./execution-target-profiles.md).

MVP product shape:

```text
RemoteMachine
  -> RemoteProject
    -> terminal / agent / Git / files / dev services
```

This matches the current project-centered SharkBay UI and avoids taking on workspace semantics before the remote execution layer is proven.

The design must still be compatible with the future workspace model:

```text
Now:
  RemoteProject = ssh://gpu-01/home/app/model-worker

Future:
  Workspace root = ssh://gpu-01/home/app
  Project        = ssh://gpu-01/home/app/model-worker
```

## 2. Product Semantics

### 2.1 Remote machine

A remote machine is a saved SSH execution target.

Examples:

```text
gpu-01
staging-api
prod-debug-box
```

It stores connection metadata only. It does not imply a workspace.

### 2.2 Remote project

A remote project is a specific directory on a remote machine.

Examples:

```text
ssh://gpu-01/home/app/model-worker
ssh://staging-api/srv/api
```

For MVP, users add remote projects by selecting a remote machine and entering an absolute remote path.

### 2.3 Temporary parent-directory project

If the user wants a parent folder for multiple services before workspace support exists, they can add that parent folder as a remote project:

```text
ssh://gpu-01/home/app/ai-platform
```

Agent terminals launched there can still edit multiple subprojects. Later, this folder can be migrated into a formal workspace root.

## 3. Non-Goals For MVP

MVP does not include:

- Workspace creation.
- Workspace-level prompt composition.
- A workspace containing multiple project records.
- One workspace spanning multiple machines.
- Remote directory browser.
- Remote helper installation.
- Remote file editing.
- Large remote file sync.
- Remote GUI app support.
- Cloud account sync.

MVP focuses on:

```text
1. Add remote machine.
2. Test SSH connection.
3. Add remote project by absolute path.
4. Open remote terminal / agent in that project.
5. Read remote Git metadata.
6. Lazy remote file tree.
```

## 4. URI Design

### 4.1 Remote machine ID

Each saved remote machine has a stable SharkBay id:

```text
gpu-01
staging-api
prod-debug-box
```

The id is used in project URI:

```text
ssh://<remote-machine-id>/<absolute-path>
```

The id does not have to equal the real SSH hostname. It may map to an SSH config host, raw host, username, port, and auth settings.

### 4.2 Remote project URI

Remote project URI format:

```text
ssh://<remote-machine-id>/<absolute-path>
```

Examples:

```text
ssh://gpu-01/home/app/model-worker
ssh://staging-api/srv/api
```

The path portion is a remote POSIX absolute path.

### 4.3 Display path

UI display path:

```text
<remote-machine-label>:<absolute-path>
```

Examples:

```text
gpu-01:/home/app/model-worker
staging-api:/srv/api
```

## 5. Data Model

### 5.1 RemoteMachine

```ts
type RemoteMachine = {
  id: string;
  label: string;
  host: string;
  port: number;
  username?: string;
  sshConfigHost?: string;
  authMode: "system-ssh-config" | "ssh-agent" | "key-file";
  keyPath?: string;
  defaultProjectPath?: string;
  createdAt: string;
  updatedAt: string;
};
```

Fields:

- `id`: stable SharkBay id used in `ssh://...` URI.
- `label`: user-facing name.
- `host`: raw SSH host, if not relying only on SSH config alias.
- `port`: default `22`.
- `username`: optional username.
- `sshConfigHost`: optional `~/.ssh/config` Host alias.
- `authMode`: MVP should prefer `system-ssh-config`.
- `keyPath`: optional key file path; never store key contents.
- `defaultProjectPath`: optional convenience path for add-project flow.

### 5.2 Execution target

Internally, each remote machine can also be treated as an execution target:

```ts
type ExecutionTarget = {
  id: string;
  kind: "local" | "ssh";
  label: string;
  status: "available" | "unavailable" | "auth-required";
};
```

For MVP, `RemoteMachine.id` can be the same as `ExecutionTarget.id`.

### 5.3 Remote project candidate

Remote projects should reuse the existing URI-first project model:

```ts
type ProjectCandidate = {
  id: string;
  uri: string;
  name: string;
  providerId: string;
  providerKind: "ssh";
  displayPath: string;
  iconSources: ProjectIconSource[];
  services: ProjectDevService[];
  dirtyWorktree: boolean | null;
};
```

Example:

```json
{
  "id": "ssh://gpu-01/home/app/model-worker",
  "uri": "ssh://gpu-01/home/app/model-worker",
  "name": "model-worker",
  "providerId": "gpu-01",
  "providerKind": "ssh",
  "displayPath": "gpu-01:/home/app/model-worker",
  "iconSources": [],
  "services": [],
  "dirtyWorktree": false
}
```

`rootUri` is not required for remote project MVP unless the current shared type still requires it. If it is required temporarily, set it equal to `uri`.

## 6. Config Storage

Until SQLite exists, store remote machines and remote projects in:

```text
~/.sharkbay/config.json
```

Suggested extension:

```ts
type AppConfig = {
  schemaVersion: 1;
  configuredRoots: string[];
  configuredProjects: string[];
  configuredRemoteMachines: RemoteMachine[];
  configuredRemoteProjects: string[];
  appearanceTheme: AppearanceTheme;
  updatedAt: string;
};
```

Rules:

- `configuredRemoteProjects` contains `ssh://...` URIs.
- Local `configuredProjects` remains local path based for now or can later become URI based.
- Do not store passwords in app config.
- Do not store private key content.
- `keyPath` is allowed.
- Passwords are stored in the operating system secret store, such as macOS Keychain.

Future SQLite tables:

```text
remote_machines
projects
execution_targets
agent_sessions
```

## 7. Provider Architecture

### 7.1 Current local provider

Current:

```text
LocalExecutionProvider
```

It handles:

- local scan
- local Git
- local file tree
- local terminal

### 7.2 New SSH provider

Add:

```text
SshExecutionProvider
```

It handles:

- SSH connection test
- remote command execution
- remote project validation
- remote terminal / agent session
- remote Git metadata/history/status
- remote lazy file tree
- remote dev service detection

### 7.3 Provider registry

Add a provider registry so `SharkBayCore` does not hard-code local vs SSH:

```ts
type ExecutionProviderRegistry = {
  getProviderForUri(uri: string): ExecutionProvider;
  getProviderForKind(kind: "local" | "ssh"): ExecutionProvider;
};
```

Routing:

```text
local:/... -> LocalExecutionProvider
ssh://... -> SshExecutionProvider
```

## 8. SSH Strategy

### 8.1 Use system ssh first

MVP should use the system `ssh` command instead of an SSH library.

Reasons:

- Reuses user `~/.ssh/config`.
- Reuses SSH agent.
- Reuses known_hosts.
- Supports ProxyJump, IdentityFile, Host aliases.
- Best terminal compatibility.

### 8.2 Build SSH target args

For `system-ssh-config`:

```text
ssh <sshConfigHost>
```

For raw host:

```text
ssh -p <port> <username>@<host>
```

For key file:

```text
ssh -i <keyPath> -p <port> <username>@<host>
```

Prefer `execFile("ssh", args)` for non-interactive commands.

### 8.3 Remote terminal

Remote project shell:

```text
ssh <target> -t 'cd <project-path> && exec ${SHELL:-/bin/sh} -l'
```

Remote agent:

```text
ssh <target> -t 'cd <project-path> && exec codex'
```

The renderer continues to use xterm. The provider changes only how the backing pty is spawned.

## 9. Remote Project Operations

### 9.1 Add remote project

Input:

```ts
type AddRemoteProjectInput = {
  remoteMachineId: string;
  projectPath: string;
};
```

Validation:

1. Remote machine exists.
2. `projectPath` is an absolute POSIX path.
3. MVP add flow allows manually entering the remote path.
4. Later SSH provider validation should check that the remote path exists and is a directory.
5. Build URI: `ssh://<remoteMachineId>/<projectPath>`.
6. Save to `configuredRemoteProjects`.

### 9.2 Project detail

For `ssh://...` project URI, `SharkBayCore.getProjectDetail` routes to `SshExecutionProvider`.

Provider runs:

```text
git -C <project-path> rev-parse --show-toplevel
git -C <project-path> branch --show-current
git -C <project-path> config --get remote.origin.url
git -C <project-path> status --porcelain
git -C <project-path> reflog --date=iso-strict --format=...
```

### 9.3 File tree

MVP lazy file tree:

```text
find <directory> -maxdepth 1 -mindepth 1 -print
```

For item kind, use `stat` or remote shell tests:

```text
test -d <path>
test -f <path>
test -L <path>
```

Only list one directory level per request.

### 9.4 Dev services

Remote dev service detection can start with JS package scripts:

```text
cat <project-path>/package.json
```

Parse locally after reading remote text.

Later add:

- Python `pyproject.toml`
- Go `go.mod`
- Java Maven/Gradle
- Rust Cargo

Service launch:

```text
ssh <target> -t 'cd <service-path> && <service-command>'
```

## 10. Remote Path Safety

Because MVP has no workspace root, the remote project root is the safety boundary.

Rules:

```text
terminal cwd must equal the remote project path
file tree directory must be inside remote project path
Git commands must use the remote project path
dev service cwd must be inside remote project path
```

Remote paths are POSIX paths.

Required helpers:

```ts
normalizeRemotePath(value: string): string
joinRemotePath(parent: string, relative: string): string
isRemotePathInside(parent: string, child: string): boolean
remotePathBasename(value: string): string
```

Do not use local `path.resolve` for remote paths.

## 11. Shell Escaping

All remote command parameters must be shell-escaped.

Do not:

```ts
`cd ${projectPath} && git status`
```

Do:

```ts
`cd ${shellQuote(projectPath)} && git status --porcelain`
```

For non-interactive commands, prefer simple command templates with quoted path arguments.

Long-term, a remote helper can remove most shell escaping complexity.

## 12. UI Flow

### 12.1 Add remote machine

Settings left navigation should show machines directly:

```text
Local Machine
  <remote machine name>  Remote
Appearance

[Add Remote Machine]
```

Clicking `Add Remote Machine` opens a modal dialog.

Dialog fields:

```text
Machine name
How do you connect to this server?
Default project path
```

Connection methods:

```text
Use my SSH config
  Server name in SSH config

Enter server address
  Server address
  Port
  Username
  Password optional

Use a specific key file
  Server address
  Port
  Username
  Key file path
```

The UI should optimize for the information the user already has:

- If the user can already run `ssh gpu-01`, choose `Use my SSH config` and enter `gpu-01`.
- If the user knows the server address, choose `Enter server address`.
- Leave password empty to use SSH agent/keychain; fill password to save a password credential.
- If the server requires a specific private key path, choose `Use a specific key file`.

Password login is part of the MVP, but the password must not be written to `~/.sharkbay/config.json`.
The config should store only metadata such as `passwordSecretId` and `hasPassword`.

Actions:

```text
Test Connection
Save
```

After save, the remote machine appears in the left navigation below Local Machine with a `Remote` tag. Selecting it opens the remote machine detail page with connection metadata, `Test Connection`, and `Remove`.

### 12.2 Add remote project

Settings or project picker:

```text
Add Remote Project
  Remote machine: gpu-01
  Project path: /home/app/model-worker
  Test / Add
```

After adding, it appears in the same project list as local projects.

### 12.3 Open remote terminal / agent

No separate UI surface is required.

Project list row:

```text
model-worker
gpu-01:/home/app/model-worker
```

Terminal actions:

```text
New terminal tab
Codex
Claude
Kiro
```

All launch with:

```text
cwdUri = project.uri
```

## 13. Error Model

Structured errors:

```ts
type RemoteErrorCode =
  | "remote-machine-not-found"
  | "auth-required"
  | "connection-failed"
  | "path-not-found"
  | "path-not-directory"
  | "unsafe-path"
  | "command-failed"
  | "timeout";
```

UI messages should be actionable:

- Auth failed: check SSH config, key, or agent.
- Path missing: verify remote project path.
- Timeout: retry or check network.
- Unsafe path: block operation.

## 14. Timeouts

Suggested defaults:

```text
connection test: 8s
path validation: 8s
Git metadata: 5s
file tree one-level list: 5s
terminal/session: no command timeout
```

Concurrency limits:

```text
max remote metadata commands per machine: 4
max remote path validation per machine: 2
```

## 15. Agent Availability

Current local `listAgentClis` detects local CLI availability.

For remote projects, this is not enough. MVP options:

1. Show the same agent buttons and let remote shell fail if command is missing.
2. Add remote detection:

```text
ssh gpu-01 -- command -v codex
ssh gpu-01 -- command -v claude
ssh gpu-01 -- command -v kiro
```

Recommended MVP:

```text
Start with option 1.
Add per-remote detection after remote terminal is stable.
```

## 16. Port Forwarding

Remote dev services may print:

```text
http://localhost:3000
```

On a remote machine, that URL refers to the remote machine, not the user's Mac.

MVP:

```text
Do not automatically port-forward.
Show detected URL as-is.
```

Later:

```text
ssh -L <local-port>:127.0.0.1:<remote-port> <target>
```

Then rewrite the service URL to local forwarded URL.

## 17. Implementation Plan

### Phase 1: Model and config

- Add `RemoteMachine` type.
- Add `configuredRemoteMachines`.
- Add `configuredRemoteProjects`.
- Add config add/remove/list APIs.
- Extend project URI parser for `ssh://machine-id/path`.

### Phase 2: SSH command runner

- Implement SSH target arg builder.
- Implement connection test.
- Implement remote command runner with timeout.
- Add remote POSIX path helpers.

### Phase 3: Remote project add/list

- Add project dialog with Local Machine or saved Remote Machine.
- Add remote project by machine + absolute path.
- Merge remote projects into project list.
- Show remote display path.
- Defer remote path existence validation until `SshExecutionProvider` exists.

### Phase 4: Remote terminal / agent

- Route `ssh://...` terminal creation to `SshExecutionProvider`.
- Spawn system `ssh` through `node-pty`.
- Launch shell and agent commands in remote project cwd.

### Phase 5: Remote Git and files

- Implement remote Git metadata/history/dirty files.
- Implement remote lazy file tree.
- Add tests for command construction and path safety.

### Phase 6: Remote dev services

- Detect JS package scripts from remote `package.json`.
- Start remote service in terminal tab.
- Document lack of automatic port forwarding.

## 18. Migration To Workspace Later

When workspace support lands:

Existing remote projects can be migrated in two ways:

### 18.1 Project as workspace root

For a remote project:

```text
ssh://gpu-01/home/app/ai-platform
```

Create:

```text
Workspace root = ssh://gpu-01/home/app/ai-platform
Project        = ssh://gpu-01/home/app/ai-platform
relativePath   = .
```

### 18.2 Infer parent workspace

For multiple remote projects on the same machine:

```text
ssh://gpu-01/home/app/ai-platform/frontend
ssh://gpu-01/home/app/ai-platform/api
ssh://gpu-01/home/app/ai-platform/worker
```

User can choose:

```text
Create workspace from parent:
  ssh://gpu-01/home/app/ai-platform
```

Then migrate projects under that workspace.

## 19. Recommended MVP Slice

First shippable slice:

```text
1. Add remote machine from Settings left nav.
2. Support user-facing connection choices: SSH config, server address, and key file.
3. Add remote project by absolute path.
4. Show remote project in project list.
5. Open remote project shell.
6. Open Codex/Claude/Kiro in remote project.
```

Next:

```text
remote Git status
remote file tree
remote JS dev services
remote agent availability detection
remote port forwarding
```
