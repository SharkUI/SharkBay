# Execution Target, Profiles, and Plugin Platform

## 1. 背景

SharkBay 已经开始从 local-only project workbench 走向 multi-target developer workbench。当前支持本地 project 和 SSH remote project，但代码里仍然存在较多 `local` / `ssh` 特判。

下一阶段不能只做一层简单抽象。SharkBay 需要把这些能力收敛成一个可扩展平台：

- Execution provider：不同运行环境的能力入口。
- Machine profile：某台 machine / execution target 的环境画像。
- Project profile：某个 project 的技术栈、命令、服务和工作方式画像。
- Plugin platform：语言、框架、agent、安装器、profile detector 都通过插件贡献能力。

这些概念应成为 SharkBay 后续个性化 UI、agent prompt、dev service 检测、remote 支持、container / WSL 支持的基础。

类比 VS Code：

- SharkBay core 提供稳定 API、权限模型、安装规范和 UI extension points。
- 官方插件提供 Git、Node、Python、Go、Java、Rust、Agent CLI 等基础能力。
- 社区插件可以贡献新的语言 detector、framework detector、agent detector、installer、commands、UI cards。
- Marketplace 负责发现、安装、升级、禁用和信任插件。

## 2. 目标

### 2.1 Plugin-first architecture

语言、框架、agent 支持不应该全部写死在 SharkBay core 中。

目标是：

```text
Core:
  execution provider
  profile orchestration
  plugin host
  permission and trust model
  marketplace installation

Plugins:
  Node support
  Python support
  Go support
  Java support
  Rust support
  Codex CLI support
  Claude Code support
  Docker support
  future custom stacks
```

Core 只内置最小 bootstrap 能力。第一方语言支持也应该以 bundled plugin 的方式实现，而不是散落在 UI 和 main process 中。

### 2.2 统一 local / remote 抽象

UI 和核心流程不应该到处判断：

```ts
if (projectUri.startsWith("ssh://")) {
  // remote
} else {
  // local
}
```

目标是改成：

```ts
const provider = providerRegistry.providerFor(projectUri);
const detail = await provider.readProjectDetail(projectUri);
```

### 2.3 自动理解 machine 环境

连接到某台 remote server 后，SharkBay 应自动检测基础信息：

- OS / OS version / kernel / architecture。
- hostname。
- 默认 shell。
- 常见工具：`git`、`python`、`node`、`go`、`java`、`brew`、`docker` 等。
- 常见包管理器和语言运行时版本。

这些信息用于：

- 判断 agent CLI 是否可用。
- 个性化 project 操作建议。
- 给 agent prompt 注入环境上下文。
- 在 UI 中提示缺失工具。
- 后续做 container / WSL / cloud devbox 时复用同一套展示和能力判断。

### 2.4 自动理解 project

每个 project 也需要 profile。Project profile 回答：

```text
这个项目是什么技术栈？
怎么安装？
怎么启动？
怎么测试？
有哪些服务？
是否是 monorepo？
有哪些环境文件？
```

Machine profile 描述“这台机器有什么”，Project profile 描述“这个项目怎么工作”。

### 2.5 自动发现和安装 agent

Agent CLI 不应该只是 `command -v codex` 的硬编码结果。Agent 插件应贡献：

- 如何检测 agent 是否已安装。
- 如何读取 agent 版本。
- 如何判断 agent 是否可用于 local / ssh / container / wsl。
- 没安装时如何给出安装方案。
- 安装命令需要什么权限和确认。
- 安装后如何重新 probe。

例如 Codex plugin 可以贡献：

```ts
{
  id: "xyz.sharkbay.agent.codex",
  contributes: {
    agents: [{
      id: "codex",
      label: "Codex CLI",
      commands: ["codex"],
      install: [
        { platform: "darwin", manager: "brew", command: "brew install codex" },
        { platform: "linux", manager: "npm", command: "npm install -g @openai/codex" }
      ]
    }]
  }
}
```

实际安装命令必须由插件声明、Core 审核权限、用户确认后执行。

## 3. 非目标

第一阶段不做：

- 完整 package dependency graph。
- 大规模远程索引。
- 长时间后台 daemon。
- 上传 profile 到云端。
- 为每种框架做深度 parser。
- 自动修改用户机器环境。
- 未经用户确认自动安装软件。
- 允许 marketplace 插件获得无限制 shell 权限。

Profile 是 SharkBay 的本地缓存和决策输入，不是远程资产管理系统。

插件第一阶段也不要求支持任意 UI 注入。先支持 profile detectors、commands、agent metadata、install recipes，再逐步开放 UI contribution。

## 4. 核心概念

### 4.1 ExecutionTarget

Execution target 是一个可执行环境。

```ts
type ExecutionTarget = {
  id: string;
  kind: "local" | "ssh" | "container" | "wsl";
  label: string;
  status: "available" | "unavailable" | "auth-required" | "unknown";
  createdAt: string;
  updatedAt: string;
};
```

当前对应关系：

```text
local machine       -> local execution target
RemoteMachine       -> ssh execution target
future container    -> container execution target
future WSL distro   -> wsl execution target
```

### 4.2 ExecutionProvider

Provider 是 target 的能力实现。SharkBay core 和 UI 应通过 provider 使用能力。

```ts
interface ExecutionProvider {
  readonly id: string;
  readonly kind: "local" | "ssh" | "container" | "wsl";
  readonly label: string;

  scanProjects(runtime, input?): Promise<ScanProjectsResult>;
  listProjectFiles(runtime, input): Promise<ProjectFilesResult>;

  readGitMetadata(projectUri: string): Promise<GitMetadata>;
  readGitHistory(projectUri: string): Promise<GitEvent[]>;
  readGitDirtyFiles(projectUri: string): Promise<GitDirtyFile[]>;

  readMachineProfile(targetId: string, options?: ProfileReadOptions): Promise<MachineProfile>;
  readProjectProfile(projectUri: string, options?: ProfileReadOptions): Promise<ProjectProfile>;

  createTerminal(runtime, input): Promise<TerminalSession>;
}
```

长期可以继续拆成 capability interfaces：

```ts
interface FileCapability {}
interface GitCapability {}
interface TerminalCapability {}
interface MachineProfileCapability {}
interface ProjectProfileCapability {}
interface AgentCliCapability {}
interface PortForwardCapability {}
```

第一阶段可以先保留现有 `ExecutionProvider`，逐步把 SSH 实现收进去。

### 4.3 Plugin

Plugin 是 SharkBay 的扩展单元。它可以贡献 detector、agent、installer、commands、UI cards 等能力。

```ts
type SharkBayPluginManifest = {
  id: string;
  name: string;
  version: string;
  publisher: string;
  engines: {
    sharkbay: string;
  };
  main?: string;
  capabilities?: PluginCapabilityRequest[];
  contributes?: PluginContributions;
};

type PluginCapabilityRequest =
  | { kind: "profile:machine" }
  | { kind: "profile:project" }
  | { kind: "agent:detect" }
  | { kind: "install:software"; requiresConfirmation: true }
  | { kind: "command:run"; scope: "local" | "target" }
  | { kind: "file:read"; patterns?: string[] };
```

Contribution examples：

```ts
type PluginContributions = {
  machineDetectors?: MachineDetectorContribution[];
  projectDetectors?: ProjectDetectorContribution[];
  agents?: AgentContribution[];
  installers?: InstallerContribution[];
  commands?: CommandContribution[];
  profileCards?: ProfileCardContribution[];
};
```

Core 负责读取 manifest、校验权限、加载插件、隔离执行、合并 profile 输出。

### 4.4 Plugin Host

Plugin host 是插件运行环境。第一阶段建议在 main process 中做受控加载，但插件 API 必须从一开始设计成可迁移到独立 worker process。

长期目标：

```text
Electron main
  -> PluginHost process
    -> plugin sandbox workers
```

插件不能直接访问 Electron、Node 全局能力和用户文件系统。插件只能通过 SharkBay API 访问能力：

```ts
interface SharkBayPluginApi {
  profiles: ProfileApi;
  targets: ExecutionTargetApi;
  files: FileApi;
  commands: CommandApi;
  installers: InstallerApi;
  ui: UiContributionApi;
  logger: LoggerApi;
}
```

### 4.5 Bundled plugins

SharkBay 可以随应用内置第一方插件：

```text
@sharkbay/core-git
@sharkbay/language-node
@sharkbay/language-python
@sharkbay/language-go
@sharkbay/language-java
@sharkbay/language-rust
@sharkbay/agent-codex
@sharkbay/agent-claude
@sharkbay/tool-docker
```

这些插件默认启用，但仍走同一套 contribution API。这样 core 不会继续膨胀成所有语言规则的集合。

## 5. Plugin Marketplace and Installation

### 5.1 Plugin package format

插件安装包是一个目录或 tarball：

```text
plugin-root/
  sharkbay-plugin.json
  dist/
    index.js
  README.md
  LICENSE
```

`sharkbay-plugin.json` 示例：

```json
{
  "id": "xyz.sharkbay.language.node",
  "name": "Node.js Support",
  "version": "1.0.0",
  "publisher": "SharkBay",
  "engines": {
    "sharkbay": "^0.2.0"
  },
  "main": "dist/index.js",
  "capabilities": [
    { "kind": "profile:machine" },
    { "kind": "profile:project" },
    { "kind": "file:read", "patterns": ["package.json", "pnpm-workspace.yaml", "*.lock"] },
    { "kind": "command:run", "scope": "target" },
    { "kind": "install:software", "requiresConfirmation": true }
  ],
  "contributes": {
    "projectDetectors": [
      { "id": "node.project", "label": "Node.js Project Detector" }
    ],
    "installers": [
      { "id": "node.corepack", "label": "Enable Corepack" }
    ]
  }
}
```

### 5.2 本地安装目录

建议目录：

```text
~/.sharkbay/plugins/
  installed/
    xyz.sharkbay.language.node/
  cache/
  marketplace.json
```

Bundled plugins 位于应用资源目录，但在运行时也映射成普通插件。

### 5.3 Marketplace metadata

Marketplace 不直接执行代码。它只提供 metadata 和包下载地址：

```ts
type MarketplacePluginEntry = {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  categories: string[];
  verified: boolean;
  downloadUrl: string;
  sha256: string;
  signature?: string;
  capabilities: PluginCapabilityRequest[];
};
```

安装流程：

1. 用户打开 marketplace。
2. SharkBay 展示插件能力和权限。
3. 用户确认安装。
4. 下载插件包。
5. 校验 sha256 / signature。
6. 写入 `~/.sharkbay/plugins/installed`。
7. 重启 plugin host 或动态加载。

### 5.4 Trust model

插件需要明确状态：

```ts
type PluginTrustState = "bundled" | "verified" | "trusted" | "untrusted" | "disabled";
```

建议策略：

- Bundled 插件默认可信。
- Verified publisher 插件显示 verified badge。
- 未验证插件默认不能执行 installer。
- 高风险权限必须二次确认。
- 用户可以 per plugin disable。

### 5.5 Software installation recipes

插件可以贡献安装方案，但不能静默执行。

```ts
type InstallRecipe = {
  id: string;
  toolId: string;
  label: string;
  targetKinds: Array<"local" | "ssh" | "container" | "wsl">;
  platforms: Array<"darwin" | "linux" | "windows" | "unknown">;
  preconditions: InstallPrecondition[];
  steps: InstallStep[];
  verification: ToolVerification;
};

type InstallStep =
  | { kind: "command"; command: string; requiresSudo?: boolean; description: string }
  | { kind: "openUrl"; url: string; description: string }
  | { kind: "manual"; markdown: string };
```

Example：

```ts
{
  id: "codex.npm.global",
  toolId: "codex",
  label: "Install Codex CLI with npm",
  targetKinds: ["local", "ssh"],
  platforms: ["darwin", "linux"],
  preconditions: [{ tool: "npm", available: true }],
  steps: [{
    kind: "command",
    command: "npm install -g @openai/codex",
    description: "Install Codex CLI globally with npm"
  }],
  verification: { command: "codex", args: ["--version"] }
}
```

Install UX：

- 显示将在哪个 target 执行。
- 显示完整命令。
- 显示是否需要 sudo。
- 用户确认后执行。
- 执行日志可见。
- 成功后自动刷新 Machine Profile。
- 失败时保留日志和 next steps。

Remote install 通过对应 provider 在远端执行。Core 必须清楚标注：

```text
This command will run on ssh://gpu-01
```

## 6. Plugin Extension Points

### 6.1 Machine detector

用于检测 OS、工具、语言运行时、agent CLI。

```ts
interface MachineDetector {
  id: string;
  label: string;
  run(ctx: MachineProbeContext): Promise<MachineProfilePatch>;
}
```

Context：

```ts
type MachineProbeContext = {
  targetId: string;
  targetKind: "local" | "ssh" | "container" | "wsl";
  osHint?: MachineProfile["os"];
  run(command: string, options?: RunOptions): Promise<CommandResult>;
  which(command: string): Promise<string | null>;
  readTextFile(path: string, options?: ReadOptions): Promise<string | null>;
};
```

Node plugin 可以贡献：

- `node` / `npm` / `pnpm` / `yarn` / `bun` / `corepack` 检测。
- Corepack installer。
- Node version manager hints。

Agent plugin 可以贡献：

- `codex` / `claude` 等 agent CLI 检测。
- agent install recipes。
- agent launch metadata。

### 6.2 Project detector

用于检测 project 技术栈、框架、命令、服务。

```ts
interface ProjectDetector {
  id: string;
  label: string;
  run(ctx: ProjectProbeContext): Promise<ProjectProfilePatch>;
}
```

Node plugin 可以检测：

- `package.json`。
- package manager。
- workspaces。
- Vite / Next / React / Electron。
- scripts。
- services。

Python plugin 可以检测：

- `pyproject.toml`。
- `requirements.txt`。
- `uv.lock` / `poetry.lock`。
- Django / FastAPI。
- pytest / ruff。

### 6.3 Agent contribution

Agent 插件描述一个 agent CLI。

```ts
type AgentContribution = {
  id: string;
  label: string;
  shortLabel: string;
  commands: string[];
  detect: {
    commandNames: string[];
    versionArgs?: string[];
  };
  launch: {
    command: string;
    args?: string[];
    supportsProjectScope: boolean;
  };
  installRecipes?: string[];
};
```

Core 根据 Machine Profile 判断：

- available。
- missing。
- installable。
- disabled by policy。

### 6.4 UI contributions

第一阶段只允许有限 UI contribution，避免插件直接渲染任意 React。

```ts
type ProfileCardContribution = {
  id: string;
  location: "machine.profile" | "project.profile";
  title: string;
  dataSelector: string;
  display: "tool-list" | "command-list" | "key-value" | "warnings";
};
```

长期可以考虑 sandboxed webview / iframe UI，但不是 MVP。

## 7. Machine Profile

### 7.1 数据模型

```ts
type MachineProfile = {
  targetId: string;
  targetKind: "local" | "ssh" | "container" | "wsl";
  detectedAt: string;
  expiresAt?: string;

  hostname: string | null;

  os: {
    platform: "darwin" | "linux" | "windows" | "unknown";
    name: string | null;
    version: string | null;
    arch: string | null;
    kernel: string | null;
  };

  shell: {
    path: string | null;
    name: string | null;
  };

  tools: ToolProfile[];
  languages: ToolProfile[];
  packageManagers: ToolProfile[];

  warnings: ProfileWarning[];
};

type ToolProfile = {
  id: string;
  command: string;
  available: boolean;
  path: string | null;
  version: string | null;
};

type ProfileWarning = {
  code: string;
  message: string;
};
```

### 7.2 推荐检测项

Core tools：

```text
git
ssh
curl
wget
tar
unzip
docker
```

JavaScript / TypeScript：

```text
node
npm
pnpm
yarn
bun
corepack
```

Python：

```text
python
python3
pip
pip3
uv
poetry
conda
```

Go / Java / Rust：

```text
go
java
javac
mvn
gradle
rustc
cargo
```

Package managers / system tools：

```text
brew
apt
dnf
yum
pacman
apk
```

Agent CLIs：

```text
codex
claude
gemini
kiro-cli
deepseek
qwen
qwen-code
opencode
```

### 7.3 探测方式

Machine probe 应尽量通过一次命令完成，避免每个工具一次 SSH。

Local:

```text
sh -lc '<probe-script>'
```

SSH:

```text
ssh <args> -- sh -lc '<probe-script>'
```

Probe script 输出 JSON，主进程只解析 JSON，不从 UI 解析文本。

推荐采集：

```sh
uname -s
uname -m
uname -r
hostname
printf '%s' "$SHELL"
cat /etc/os-release 2>/dev/null
sw_vers 2>/dev/null
command -v <tool>
<tool> --version
```

注意事项：

- 每个 version 命令都要容错。
- 输出必须截断，避免异常工具输出过大。
- 不执行会修改环境的命令。
- 不读取敏感文件。
- Remote probe 失败不应阻塞 remote project 打开。

### 7.4 缓存策略

Machine profile 是缓存，不是用户配置。

建议存储：

```text
~/.sharkbay/cache/machine-profiles/<target-id>.json
```

或后续进入 SQLite：

```text
machine_profiles(target_id, target_kind, profile_json, detected_at, expires_at)
```

刷新策略：

- 添加 remote machine 并 Test Connection 成功后刷新。
- App 启动后后台刷新过期 profile。
- 用户在 remote machine detail 页面手动 Refresh。
- 默认 TTL 可设为 24 小时。

## 8. Project Profile

### 8.1 数据模型

```ts
type ProjectProfile = {
  projectUri: string;
  targetId: string;
  targetKind: "local" | "ssh" | "container" | "wsl";
  detectedAt: string;
  expiresAt?: string;

  name: string;
  displayPath: string;

  vcs: {
    type: "git" | "none" | "unknown";
    root: string | null;
    branch: string | null;
    remoteOrigin: string | null;
    dirty: boolean | null;
  };

  languages: DetectedItem[];
  frameworks: DetectedItem[];
  packageManagers: DetectedPackageManager[];

  commands: {
    install?: string;
    dev?: string;
    build?: string;
    test?: string;
    lint?: string;
    format?: string;
  };

  services: ProjectServiceProfile[];

  env: {
    files: string[];
    exampleFiles: string[];
    requiredKeys?: string[];
  };

  structure: {
    monorepo: boolean;
    workspaces: ProjectWorkspaceProfile[];
    importantFiles: string[];
  };

  warnings: ProfileWarning[];
};

type DetectedItem = {
  id: string;
  confidence: number;
  evidence: string[];
};

type DetectedPackageManager = {
  id: "npm" | "pnpm" | "yarn" | "bun" | "pip" | "uv" | "poetry" | "conda" | "go" | "maven" | "gradle" | "cargo";
  confidence: number;
  manifest?: string;
  lockfile?: string;
  evidence: string[];
};

type ProjectServiceProfile = {
  id: string;
  label: string;
  command: string;
  cwdUri: string;
  script?: string;
  likelyPorts: number[];
};

type ProjectWorkspaceProfile = {
  name: string;
  path: string;
  packageManager?: string;
};
```

### 8.2 检测维度

Git:

- `.git` 或 `git rev-parse --show-toplevel`。
- current branch。
- remote origin。
- dirty worktree。

Node / TypeScript:

- `package.json`。
- `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`bun.lockb`。
- `tsconfig.json`。
- `vite.config.*`、`next.config.*`、`electron` dependency。
- `scripts.dev`、`scripts.build`、`scripts.test`、`scripts.lint`。
- `workspaces` / `pnpm-workspace.yaml`。

Python:

- `pyproject.toml`。
- `requirements.txt`。
- `uv.lock`、`poetry.lock`、`Pipfile`。
- `manage.py`、`app/main.py`、FastAPI / Django hints。
- pytest / ruff config。

Go:

- `go.mod`。
- `go.sum`。
- common service entrypoints。

Java:

- `pom.xml`。
- `build.gradle`、`settings.gradle`。
- Spring Boot hints。

Rust:

- `Cargo.toml`。
- `Cargo.lock`。

Env:

- `.env`
- `.env.local`
- `.env.example`
- `.env.sample`

Services:

- Existing `discoverProjectDevServices` results。
- Package scripts。
- Python web CLIs。
- Framework config hints。

### 8.3 探测深度

Project profile 应支持分级探测：

```ts
type ProfileDepth = "quick" | "standard" | "deep";
```

`quick`：

- 打开项目时可跑。
- 读取顶层文件列表。
- Git metadata。
- 常见 manifest / lockfile。
- dev service 快速检测。

`standard`：

- 后台刷新。
- 读取 manifest 内容。
- 识别语言、框架、包管理器、命令。
- 识别 monorepo workspaces。

`deep`：

- 用户触发或 agent 需要时跑。
- 更细的依赖、端口、CI、Docker Compose、测试框架检测。
- 可能读取更多文件，但仍要有大小和数量限制。

### 8.4 缓存策略

建议存储：

```text
~/.sharkbay/cache/project-profiles/<project-uri-hash>.json
```

或 SQLite：

```text
project_profiles(project_uri, target_id, profile_json, detected_at, expires_at)
```

失效条件：

- TTL 过期。
- manifest / lockfile mtime 变化。
- Git HEAD 变化。
- 用户手动 Refresh。

Remote project profile 不应依赖完整文件同步。第一阶段只读取顶层和少量 manifest。

## 9. Probe Context and Detectors

Detector 由插件贡献，但 detector 不应该知道 local / ssh。Provider 负责给 detector 一个统一上下文。

```ts
type ProjectProbeContext = {
  projectUri: string;
  targetId: string;
  targetKind: "local" | "ssh" | "container" | "wsl";
  projectPath: string;

  listFiles(relativePath?: string, options?: ListOptions): Promise<FileEntry[]>;
  readTextFile(relativePath: string, options?: ReadOptions): Promise<string | null>;
  run(command: string, options?: RunOptions): Promise<CommandResult>;
};
```

第一方 bundled plugins 可以贡献这些 detectors：

```text
profiles/detectors/git.ts
profiles/detectors/node.ts
profiles/detectors/python.ts
profiles/detectors/go.ts
profiles/detectors/java.ts
profiles/detectors/rust.ts
profiles/detectors/env.ts
profiles/detectors/services.ts
```

每个 detector 输出 partial profile：

```ts
type ProjectProfilePatch = Partial<ProjectProfile>;
```

最终由 profile aggregator 合并结果、处理 confidence 和 warnings。

## 10. Profile Orchestration

Profile orchestration 是 Core 的职责。它不写死 Node/Python/Agent 规则，而是调度插件 detector。

流程：

```text
readMachineProfile(target)
  -> resolve provider
  -> create MachineProbeContext
  -> collect enabled machine detectors from plugins
  -> run detectors with timeout and permissions
  -> merge patches
  -> cache profile
  -> emit profile update

readProjectProfile(projectUri)
  -> resolve provider
  -> create ProjectProbeContext
  -> collect enabled project detectors from plugins
  -> run quick detectors first
  -> schedule standard/deep detectors in background
  -> merge patches
  -> cache profile
  -> emit profile update
```

Detector 执行策略：

- 每个 detector 有 timeout。
- Detector 失败只产生 warning，不让整个 profile 失败。
- Detector 权限由 manifest 控制。
- Detector 输出必须是结构化 patch。
- Aggregator 负责去重、排序、confidence 合并。

## 11. Provider Registry

需要一个 registry 负责根据 URI 选择 provider。

```ts
class ExecutionProviderRegistry {
  providerForUri(uri: string): ExecutionProvider {
    const parsed = parseProjectUri(uri);
    if (parsed.kind === "local") return this.localProvider;
    if (parsed.kind === "ssh") return this.sshProviderFor(parsed.machineId);
    ...
  }
}
```

`SharkBayCore` 应逐步变成 provider orchestration，而不是自己特判 SSH。

当前应收敛的特判：

- `SharkBayCore.getProjectDetail()` 中 remote git 特判。
- `listProjectFiles/read/writeProjectFile()` 中 remote file 特判。
- `TerminalManager.resolveLaunchSpec()` 中 SSH launch 特判。
- `agent-clis.ts` 中 remote CLI discovery 特判。
- `remote-files.ts`、`remote-git.ts`、`terminal.ts`、`port-forwards.ts` 重复的 SSH auth / runner 拼装。

## 12. UI 使用方式

### 12.1 Remote machine detail

Remote machine detail 页面展示 Machine Profile：

- OS name / version / arch。
- hostname。
- shell。
- Core tools。
- Languages。
- Package managers。
- Agent CLIs。
- Last detected time。
- Refresh profile 按钮。

### 12.2 Project detail

Project detail 页面展示 Project Profile：

- Git summary。
- Languages / frameworks。
- Package manager。
- Common commands。
- Dev services。
- Env files。
- Monorepo workspaces。

### 12.3 Agent launch

Agent 按钮应由 profile 决定：

- Local project：看 local machine profile。
- Remote project：看 remote machine profile。
- 若 `codex` 不存在，按钮不显示或显示 disabled reason。
- Agent prompt 可以注入 machine + project 摘要。
- 如果 agent 缺失但存在可用 install recipe，显示 Install 按钮。
- 安装前展示插件来源、目标机器、完整命令和权限。

示例 prompt context：

```text
Execution target: ssh gpu-01, Ubuntu 22.04, x86_64, shell /bin/bash
Project: /home/app/model-worker
Stack: TypeScript, Node 22, pnpm, Vite
Commands: pnpm dev, pnpm test, pnpm build
Git: main, dirty worktree
```

### 12.4 Marketplace

Settings 增加 Extensions / Plugins 页面：

- Installed plugins。
- Bundled plugins。
- Marketplace search。
- Plugin details。
- Permissions。
- Enable / disable。
- Update。
- Uninstall。

Project detail 和 machine detail 可以显示由插件贡献的 cards，但第一阶段仅支持 Core 定义的安全 card 类型。

## 13. Performance and Process Architecture

### 13.1 当前状态

当前 SharkBay 基本还是 Electron main process 中心架构：

```text
Renderer React
  <-> Electron IPC
    <-> Electron main
      -> config
      -> scanner
      -> Git commands
      -> SSH commands
      -> terminal/node-pty
      -> browser views
      -> agent session watcher
      -> port forwards
```

这个结构适合 MVP，因为实现快、调试简单、能充分利用 Node.js 和 Electron 原生能力。但它不适合长期承载：

- 多 project 后台扫描。
- 多 remote server profile probe。
- 多插件 detector 并发运行。
- 长时间 agent session supervision。
- 大量 terminal output / logs。
- Marketplace 插件执行。
- Remote helper connection pool。

因此，Electron 应长期作为 desktop shell 和 IPC gateway，而不是业务核心和插件运行时。

### 13.2 目标进程模型

中长期目标：

```text
Renderer
  - React UI
  - xterm rendering
  - profile cards
  - marketplace UI

Electron Main
  - app lifecycle
  - windows / menus / dock
  - native dialogs
  - secure IPC gateway
  - credential gateway
  - BrowserView/WebContentsView

SharkBay Core Service
  - project/machine state
  - provider registry
  - profile orchestration
  - terminal/session supervisor
  - agent session supervisor
  - event bus
  - SQLite/cache/log store

Plugin Host
  - plugin discovery
  - manifest validation
  - bundled plugin runtime
  - marketplace plugin runtime
  - permission checks

Worker Pool
  - profile detector jobs
  - project scanning
  - log parsing
  - CPU-heavy analysis

Remote Helper (optional)
  - remote file tree streaming
  - remote git/status cache
  - remote project profile probe
  - remote session assist
```

第一阶段 Core Service 可以仍然是 Electron main 内的 TypeScript class。重要的是 API 边界先按独立服务设计，后续才能迁移到 child process / worker thread / Rust or Go helper。

### 13.3 Electron main 的长期边界

Electron main 应保留：

- 创建窗口。
- 管理菜单、dock、系统事件。
- 连接 renderer IPC。
- 调用系统 keychain / credential provider。
- 打开 native file dialog。
- 管理 BrowserView/WebContentsView。
- 启动和监督 Core Service / Plugin Host。

Electron main 不应长期负责：

- 递归扫描项目。
- 执行插件 detector。
- 解析大量日志。
- 维护复杂 remote connection pool。
- 跑 marketplace 第三方插件代码。
- 保存所有业务状态。

### 13.4 Core service

Core service 是 SharkBay 的业务大脑。它可以先是 Node.js/TypeScript child process：

```text
electron-main <-> core-service over IPC/RPC
```

职责：

- Provider registry。
- Machine/project profile orchestration。
- Project/task/session 数据模型。
- Terminal/session lifecycle。
- Agent session lifecycle。
- Profile cache。
- SQLite store。
- Event bus。
- Job scheduler。

Core service 必须支持 backpressure：

- 限制每个 target 的并发 job。
- 限制 remote SSH 并发。
- 限制 detector 超时时间。
- 限制 terminal ring buffer。
- 限制 IPC event 频率。

### 13.5 Plugin host and workers

插件运行不应和 Electron main 共享故障域。目标：

```text
core-service
  -> plugin-host
    -> plugin worker
```

执行策略：

- Bundled plugins 可以先 in-process。
- 第三方插件默认 out-of-process。
- Detector jobs 进入 worker pool。
- 每个 job 有 timeout、memory/output limit。
- 插件 crash 不影响 app。
- 插件输出只能是结构化 patch / contribution result。

MVP 如果暂时不能做完整 sandbox，也要让 API 形状保持可迁移：

```ts
pluginHost.runDetector(pluginId, detectorId, contextRef)
```

而不是把 detector 函数直接散落调用在业务代码里。

### 13.6 Job scheduler

Profile 和插件体系需要统一 job scheduler。

```ts
type SharkBayJob = {
  id: string;
  kind: "machine-profile" | "project-profile" | "scan" | "agent-detect" | "install" | "log-parse";
  targetId: string;
  projectUri?: string;
  priority: "interactive" | "background" | "idle";
  timeoutMs: number;
};
```

调度原则：

- 用户当前正在看的 project 优先。
- Remote target 默认低并发。
- Idle detector 不抢占 terminal / agent。
- 同一 project 的 profile job 合并去重。
- 安装 job 必须用户确认，不自动重试。
- 所有 job 有可观测状态和日志。

### 13.7 Data and IPC performance

Renderer 不应接收无限流数据。

建议：

- Terminal output 使用 ring buffer + append event。
- 大日志按 chunk 懒加载。
- Profile update 发送 diff 或完整小对象，避免巨型对象频繁广播。
- File tree 使用分页 / lazy directory loading。
- Scanner 返回 skeleton，然后增量补 metadata。
- SQLite 作为核心状态索引，JSON 只保留启动配置。

IPC event 应有节流：

```text
terminal output: streaming but bounded
profile updates: coalesced
scan updates: batched
agent status: latest-state wins
```

### 13.8 Remote performance

SSH command-per-operation 是 MVP 可接受方案，但不是长期性能模型。

VS Code Remote Development 的做法值得参考：Remote extensions 会在远端 OS 上安装 VS Code Server，让命令和扩展能直接和远端 workspace / filesystem 交互；这个 server 由 VS Code client 管理生命周期，不接入用户或系统级启动脚本，也不是给其他 client 复用的通用 daemon。Remote-SSH 还会使用 SSH tunnel 和随机本地端口或 Unix socket 通信，并提供 kill / uninstall server 的清理命令。

SharkBay 应采用相同原则，但分阶段实现：

- 第一次连接不强制安装 helper。
- 基础能力先通过 SSH command mode 工作。
- 当用户启用高级 remote acceleration，或某个 remote target 达到性能阈值时，再提示安装 SharkBay Remote Helper。
- Helper 安装在用户目录，例如 `~/.sharkbay/remote-helper/<version>`。
- Helper 由 SharkBay Core 启动、停止、升级和卸载，不写入 systemd、launchd、shell startup，除非用户显式选择。
- Helper 以登录用户身份运行，不获取额外权限。
- Helper 和本地 Core 通过 SSH tunnel 通信，默认只监听 localhost 或 Unix socket。
- Helper 必须有 Kill / Uninstall 操作。

分阶段：

1. SSH command mode：
   - 简单可靠。
   - 每次操作启动进程，延迟较高。
   - 适合 git metadata、少量文件读取、quick profile。
2. SSH connection reuse：
   - 使用 ControlMaster / multiplexing 或内部 connection pool。
   - 降低重复连接成本。
3. Remote helper：
   - 可选安装 / 按需启动。
   - 通过 SSH tunnel 通信。
   - 负责远端扫描、缓存、文件树、profile probe。
   - 承载远端插件 detector 中允许在 remote 运行的部分。

Remote helper 不应成为 MVP 硬依赖。用户不安装 helper 时，基础 remote project 仍可工作。

### 13.9 Performance budgets

建议建立明确预算：

```text
App cold start to first window: < 1.5s target
Project list skeleton render: < 300ms after config load
Local quick project profile: < 500ms per active project
Remote quick project profile: < 2s best effort
Machine profile probe: < 5s best effort
Plugin detector timeout: 1-5s by detector type
Terminal output retained in memory: bounded ring buffer
Remote concurrent jobs per target: default 2-4
Background detector CPU: idle / low priority
```

这些预算不一定第一天全部达成，但要成为设计约束。

### 13.10 Observability

性能问题需要可观测性：

- Job timeline。
- Detector duration。
- Plugin crash/error logs。
- SSH command latency。
- Profile cache hit/miss。
- IPC event rate。
- Terminal buffer size。
- Renderer render timing。

Settings 可以增加 Diagnostics 页面，导出最近日志，方便定位 remote / plugin / performance 问题。

## 14. Migration Plan

### Implementation tracker

| Area | Status | Notes |
| --- | --- | --- |
| Shared target/profile/plugin types | Done | Added final architecture models in `src/shared/types.ts`. |
| Core service boundary | Done (MVP) | Electron IPC now talks to `SharkBayCoreService` through a `CoreClient` proxy that forks the service into an Electron `utilityProcess` (`electron/core-host.ts`). Legacy `src/main/core/SharkBayCore` removed. |
| Provider registry | Done | URI- and target-id-based dispatch in `src/core/provider-registry.ts`; no SSH special cases in callers. |
| Local provider final shape | In progress | Runtime IPC uses `LocalProvider` with `readProjectFingerprint` and `pathExistsOnTarget`. Profile detector migration remains. |
| SSH provider final shape | In progress | Runtime IPC uses `SshProvider` with `pathExistsOnTarget`; helper / connection pooling remain. |
| Plugin manifest and bundled plugin loader | In progress | All 7 bundled detectors now declare a `sharkbay-plugin.json` manifest and register through `PluginHost.registerPlugin`. Disabled state persists in `AppConfig.disabledPluginIds` and applies on Core spawn; Settings → Extensions UI lists plugins and toggles enable/disable. Filesystem scanner for `~/.sharkbay/plugins/installed/` reads manifests but cannot execute plugin code yet (deferred to Phase 5.x sandbox). |
| Profile orchestrator | In progress | Orchestrator with quick/standard/deep depth filtering; bundled detectors for core, Node, Python, Go, Rust, Java, and Agent CLIs. Detector `runOn` declares supported depths. |
| Job scheduler | In progress | Added scheduler with per-target concurrency, priority, timeout, dedupe, and profile detector integration. Diagnostics collector subscribes to job updates and aggregates per-detector durations + failures. |
| Diagnostics | In progress | Core-side `DiagnosticsCollector` tracks last 50 jobs, per-detector aggregates, cache hit/miss per category, SSH latency (count/avg/p50/p95/max + errors), terminal data event throughput. Settings → Diagnostics tab auto-refreshes every 3 s. |
| Profile cache/storage | In progress | File cache keyed by `<target/uri>|<depth>` with 24h machine / 15min project TTLs; project cache invalidates on manifest-mtime / git-HEAD change for local provider. SQLite migration remains. |
| UI profile consumption | In progress | Agent CLI buttons from MachineProfile; Stack tab in project detail and Machine Profile card in remote machine detail consume profiles via `profiles:*` IPC. Project list has context menu (rename / remove) with persisted `projectAliases`. Add Project verifies remote path via `targets:pathExists` before saving; terminals emit a friendly toast hint when they exit with a non-zero code within 5s. |
| Agent install pipeline | Done (MVP) | Recipe listing, Core install/verify/refresh, IPC bridge, and renderer Install Agent dialog with command preview, target label, logs, and post-install refresh. |
| Core service process isolation | Done (MVP) | `SharkBayCoreService` runs in an Electron `utilityProcess`. `CoreClient` (`electron/core-client.ts`) provides request/response + event forwarding via `parentPort` messages. Browser/AgentSessionWatcher/PortForwardManager stay in Electron main for now. Worker-pool split inside the core process remains. |
| Remote helper strategy | Documented | Helper is optional, user-scoped, SharkBay-managed, and not a system daemon by default. |

### Phase 1: Plugin manifest and bundled plugins

- 新增 `sharkbay-plugin.json` schema。
- 新增 plugin loader。
- 把现有 Git / Node service / Agent CLI detection 先包装成 bundled plugins。
- 新增 `MachineProfile`、`ProjectProfile` shared types。
- 不开放第三方 marketplace。

### Phase 2: Profile orchestration

- 新增 local machine probe。
- 新增 SSH machine probe。
- 新增 project quick profile aggregator。
- Detector 从 bundled plugins 收集。
- 增加 profile cache。

### Phase 3: SSH provider

- 新增 `SshExecutionProvider`。
- 把 remote git / remote files / remote terminal launch 移入 provider。
- 新增 `ExecutionProviderRegistry`。
- `SharkBayCore` 通过 registry 分派。

### Phase 4: Profile UI and agent install

- Remote machine detail 展示 profile。
- Project detail 展示 quick profile。
- Test Connection 成功后自动刷新 machine profile。
- Agent CLI discovery 改为消费 Machine Profile。
- Agent 缺失时显示 install recipes。
- 用户确认后支持一键安装，并刷新 profile。

### Phase 5: Marketplace MVP

- 增加 installed plugins 目录。
- 增加 marketplace metadata 读取。
- 支持安装 / 禁用 / 卸载插件。
- 支持 verified publisher 和 sha256 校验。
- 第三方插件只开放 detector / command / installer contribution，不开放任意 UI。

### Phase 6: Language and framework plugins

- 抽出 `discoverProjectDevServices` 为 Node / service detector。
- 增加 Python / Go / Java / Rust bundled plugins。
- 增加 monorepo 检测。
- 增加 framework detector。

### Phase 7: Performance isolation

- 把 profile orchestration 迁到 Core Service 边界后面。
- 增加 job scheduler。
- Detector jobs 迁到 worker pool。
- 第三方插件迁到 Plugin Host process。
- Electron main 只保留 app lifecycle 和 IPC gateway。

> Note: SharkBay 不引入独立的 "workspace" 抽象。Project 已经绑定 target (URI 携带 target id)，
> agent launch 直接消费 selected project 的 machine + project profile 作为上下文。
> 多 project 聚合的 UX 需求（grouping、pin、tag）按需用轻量方式实现，不再建模成一层概念。

## 15. Open Questions

- Profile 是否进入 `AppConfig`，还是只存 cache / SQLite？
  - 建议不进入 `AppConfig`，避免配置文件包含大量易变数据。
- Project profile 默认 TTL 多久？
  - 建议 quick profile 5-15 分钟，standard profile 24 小时或 manifest 变更后刷新。
- Remote machine profile 失败是否影响 remote project？
  - 不影响。显示 warning，继续允许 terminal / files / git。
- 是否需要 remote helper？
  - 第一阶段不需要。先用 SSH + shell script。后续如果 profile / file tree / search 变重，再考虑 helper。
- Windows remote 是否支持？
  - 第一阶段 `unknown` / best effort。SSH remote 默认按 POSIX shell 处理。
- Marketplace 走自建 registry 还是 GitHub release index？
  - MVP 可先支持本地 / GitHub URL 安装，后续再做官方 marketplace。
- 插件是否允许任意 JS 执行？
  - MVP 可以加载 bundled plugin JS。第三方插件应先限制在 manifest contribution + declarative recipes，之后再开放 sandbox worker。
- 一键安装是否允许 sudo？
  - 默认不允许静默 sudo。需要 sudo 的 recipe 必须显著提示，并要求用户确认。
- 插件 UI 是否允许 React component？
  - MVP 不允许。先使用 Core 提供的 profile card schema。
- Core Service 是 Node child process、worker thread，还是 Rust/Go daemon？
  - 建议先 Node child process，边界稳定后再迁移性能敏感模块。
- Remote helper 何时引入？
  - 当 SSH command mode 在 file tree/profile/search 上成为瓶颈时再引入。

## 16. 设计原则

- Provider 负责“怎么执行”。
- Machine Profile 负责“机器有什么”。
- Project Profile 负责“项目怎么工作”。
- Plugin 负责贡献语言、框架、agent、installer 能力。
- Electron 负责桌面壳和安全 IPC，不长期承担业务核心。
- Core Service 负责业务状态、调度和 provider orchestration。
- Detector 由插件贡献，但不知道 local / ssh。
- UI 不判断 local / remote，只消费能力和 profile。
- Profile 是缓存，不是用户手写配置。
- Probe 必须快、可失败、无副作用。
- Installer 必须用户确认、可审计、可回滚到至少“停止继续执行”。
- Marketplace 插件必须有 manifest、版本、权限、完整性校验。
