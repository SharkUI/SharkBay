# Workspace Agent Platform Requirements and Architecture

## 1. 背景

SharkBay 当前是一个 local-first macOS developer workbench：扫描用户配置的本地目录，识别 Git 项目，展示 Git 状态、文件树、dev service，并提供项目维度的终端空间。

下一阶段目标应从“本地项目工作台”升级为“workspace 级 agent 工作平台”：用户在一个 workspace 下管理多个项目、多个 agent CLI、多种运行环境，以及后续的需求和任务流。核心价值是减少开发者在多个终端、多个项目、多个远程机器之间来回切换的成本。

## 2. 需求整理

### 2.1 Workspace 级 agent 工作台

用户希望在某个 workspace 下统一使用各种 agent 工作，例如：

- Codex CLI
- Claude Code
- Kiro CLI
- 未来其他本地或远程 agent

产品不应要求用户到处切换终端。打开一个 workspace 后，用户应能在同一界面里：

- 查看 workspace 下的项目列表。
- 进入某个项目目录。
- 启动普通 shell、dev service 或 agent CLI。
- 看到不同 agent session 的状态、上下文目录、输出和历史。
- 将 agent session 和具体项目、任务、分支关联起来。

### 2.2 兼容多语言、多框架、多项目结构

SharkBay 需要兼容各种项目结构和技术栈，包括但不限于：

- Python：pip、uv、poetry、conda、pytest、ruff、Django、FastAPI。
- JavaScript/TypeScript：npm、pnpm、yarn、bun、Vite、Next.js、React、Node service。
- Java/Kotlin：Maven、Gradle、Spring Boot。
- Go：go modules、go test、air。
- Rust：Cargo。
- Monorepo：多个 package、多个 app、多个 service。
- 普通 Git repo：无框架配置时仍然可作为项目打开。

兼容策略应基于“可插拔 project detector”，而不是把所有规则写死在 UI 或扫描流程里。

### 2.3 Workspace 下的 task 管理

未来希望在 workspace 下做轻量任务管理，例如：

- 需求列表。
- 任务状态。
- 优先级、负责人、标签、截止日期。
- task 与 project、branch、commit、PR、agent session 的关联。
- agent 执行过程中的任务状态变更记录。

这部分不应一开始做成复杂项目管理系统。第一阶段可以是 local-first task store，后续再支持 GitHub Issues、Linear、Jira、Notion 等外部系统同步。

### 2.4 Remote computer / remote project

用户希望添加 remote computer，例如一台 server，然后打开该 server 某个目录下的 project。之后打开终端、agent、文件树、dev service 等操作都应该像本地 project 一样。

关键要求：

- 远程机器作为 workspace 的一种 execution target。
- 本地 project 和 remote project 使用统一抽象。
- 终端、agent CLI、文件浏览、Git 状态、dev service 启停都通过同一套能力接口调用。
- 远程连接需要明确的安全边界、凭据管理、断线恢复和可观测日志。

## 3. 产品原则

### 3.1 Workspace first

SharkBay 的一级对象应从 scan root / local repo 升级为 workspace。workspace 可以包含：

- Local roots。
- Remote machines。
- Projects。
- Agent profiles。
- Tasks。
- Saved sessions。
- Environment capabilities。

### 3.2 Project is an address, not only a local path

当前 `ProjectCandidate.path` 是本地 filesystem path。未来项目地址应扩展为：

```text
local:/Users/user/Code/app
ssh://server/home/user/app
container://devbox/workspaces/app
wsl://Ubuntu/home/user/app
```

UI 和业务流程尽量只依赖 `ProjectRef`，不要直接依赖本地绝对路径。

### 3.3 Capability based execution

不要让 UI 判断“这是本地还是远程”。UI 应请求能力：

- list files
- spawn terminal
- run command
- read git status
- detect services
- start service
- launch agent

底层由不同 provider 实现：

- Local provider。
- SSH provider。
- Container provider。
- Future cloud/devbox provider。

### 3.4 Local-first, explicit sync

workspace 配置、任务、session 元数据优先本地存储。任何远程同步、外部 issue 系统同步、云端备份都应是显式功能，不能隐式上传项目数据。

### 3.5 统一产品数据目录

SharkBay 的产品数据统一放在：

```text
~/.sharkbay/
```

建议目录结构：

```text
~/.sharkbay/
  config.json
  sharkbay.sqlite
  logs/
  sessions/
  remotes/
  cache/
```

Electron 的平台运行数据仍可留在系统 `userData` 目录，但 workspace、project、task、remote、agent session 等可迁移和可备份的数据都应放在 `~/.sharkbay`。

## 4. 建议领域模型

### 4.1 Workspace

```ts
type Workspace = {
  id: string;
  name: string;
  roots: WorkspaceRoot[];
  remotes: RemoteComputer[];
  projects: ProjectRef[];
  agentProfiles: AgentProfile[];
  createdAt: string;
  updatedAt: string;
};
```

### 4.2 ProjectRef

```ts
type ProjectRef = {
  id: string;
  name: string;
  uri: string;
  workspaceId: string;
  providerId: string;
  git?: GitSummary;
  detectedStacks: DetectedStack[];
};
```

### 4.3 ExecutionTarget

```ts
type ExecutionTarget = {
  id: string;
  kind: "local" | "ssh" | "container" | "wsl";
  label: string;
  status: "available" | "unavailable" | "auth-required";
  capabilities: string[];
};
```

### 4.4 AgentProfile

```ts
type AgentProfile = {
  id: string;
  label: string;
  command: string;
  args?: string[];
  supportedTargets: Array<"local" | "ssh" | "container" | "wsl">;
  environment?: Record<string, string>;
};
```

### 4.5 AgentSession

```ts
type AgentSession = {
  id: string;
  workspaceId: string;
  projectId: string;
  agentProfileId: string;
  executionTargetId: string;
  cwdUri: string;
  terminalSessionId: string;
  taskId?: string;
  status: "running" | "exited" | "failed";
  createdAt: string;
  updatedAt: string;
};
```

### 4.6 Task

```ts
type Task = {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  status: "backlog" | "ready" | "in-progress" | "blocked" | "review" | "done";
  priority?: "low" | "medium" | "high" | "urgent";
  projectIds: string[];
  agentSessionIds: string[];
  externalLinks: string[];
  createdAt: string;
  updatedAt: string;
};
```

## 5. 实现方案

### 5.1 短期：在当前 Electron 架构上演进

当前技术栈 Electron + React + TypeScript + node-pty 是合理的起点，尤其适合：

- 本地 shell / agent CLI。
- macOS 桌面权限模型。
- xterm 终端体验。
- 本地-first 数据和安全边界。

短期不建议立即重写。应先把领域模型和 provider 边界抽出来，避免现有代码继续围绕“本地 path”扩大。

建议改造方向：

- 新增 `WorkspaceStore`：管理 workspace、project ref、remote、task、agent session 元数据。
- 新增 `ExecutionProvider` 接口：封装 local/ssh/container 的文件、命令、终端、Git 能力。
- 将当前 `terminal.ts`、`git.ts`、`project-files.ts` 迁移为 `LocalExecutionProvider` 的实现细节。
- 将 `agent-clis.ts` 升级为 agent profile registry。
- 将 scanner 改造为 detector pipeline：root scanner 只负责发现候选目录，detector 负责识别技术栈和服务。

### 5.2 中期：引入后台 core service

如果要支持高性能、高扩展性和远程 computer，Electron main process 不宜长期承担所有扫描、会话、远程连接和任务调度。

建议中期拆出一个长期运行的 core service：

```text
Renderer (React)
  <-> Electron Main / IPC gateway
    <-> SharkBay Core Service
      <-> Providers: local, ssh, container, future cloud
      <-> Stores: workspace, tasks, session logs, credentials metadata
```

core service 可以先仍用 Node.js/TypeScript 实现，降低迁移成本；如果后续出现性能瓶颈，再把关键模块迁移到 Rust/Go。

Core service 职责：

- Workspace 数据模型。
- Project detection。
- Terminal/session lifecycle。
- Agent session lifecycle。
- Remote connection pool。
- Task store。
- Event bus。
- Persistent logs。

Electron main 职责收窄为：

- App lifecycle。
- Native window。
- Security IPC bridge。
- BrowserView/WebContentsView。
- 系统凭据和 shell integration 的网关。

### 5.3 长期：可插拔 provider 和 extension runtime

为了兼容更多 agent、语言框架、远程环境，长期需要插件化，但插件边界必须稳定。

优先插件点：

- Project detector plugin：识别语言、框架、dev command、test command。
- Agent adapter plugin：描述 agent CLI 如何启动、如何传入 cwd、如何识别状态。
- Execution provider plugin：local、ssh、container、devbox。
- Task sync plugin：GitHub Issues、Linear、Jira。

插件不应直接访问 Electron renderer。插件运行在 core service 的受控 runtime 中，通过 capability API 工作。

## 6. Remote computer 方案

### 6.1 第一阶段：SSH provider

优先实现 SSH，因为它覆盖大多数 server 场景。

能力范围：

- 连接测试。
- 远程目录选择或手动输入 project path。
- 远程 Git 状态读取。
- 远程文件树。
- 远程 shell / agent CLI session。
- 远程 dev service 命令。

实现选择：

- 终端优先使用本机 `ssh` + `node-pty`，可靠性高，兼容用户已有 SSH config、agent、known_hosts。
- 文件树和 Git 状态可以先通过远程命令执行实现，例如 `ssh host git -C path status --porcelain`。
- 后续再引入 SFTP 或 rsync-style file API 提升性能。

安全策略：

- 不在 SharkBay 明文保存 SSH 密码。
- 优先依赖系统 SSH agent、`~/.ssh/config`、Keychain。
- remote path 必须绑定到用户配置的 remote root，不能任意执行 renderer 传来的路径。
- 所有远程命令都要经过 provider 层参数化构造，避免 shell 注入。

### 6.2 第二阶段：远程能力缓存

远程操作有网络延迟，需要缓存：

- project metadata cache。
- file tree cache。
- Git status cache。
- detector result cache。
- connection health cache。

缓存必须带来源和更新时间，UI 展示 stale 状态，后台增量刷新。

### 6.3 第三阶段：remote helper

当 SSH 命令模式无法满足性能时，可在远程机器上启动轻量 helper：

```text
Local SharkBay Core <-> SSH tunnel <-> Remote SharkBay Helper
```

helper 职责：

- 本地化扫描 remote filesystem。
- 维护远程 terminal/session。
- 提供 streaming file tree 和 Git status。
- 减少每次操作的 SSH process 启动成本。

helper 应是可选增强，不应成为打开 remote project 的硬依赖。

## 7. 高性能设计

### 7.1 扫描和检测

- 扫描与检测分离：扫描只发现候选目录，检测异步补全 metadata。
- 使用增量扫描：mtime、Git HEAD、package lock hash、配置文件 hash。
- 大目录限制深度和排除规则：`.git`、`node_modules`、`target`、`dist`、`.venv`。
- detector 并发数可配置，避免拖垮本机或远程机器。
- UI 先显示项目 skeleton，再流式更新 Git、service、task、agent 状态。

### 7.2 终端和 agent session

- session lifecycle 放在 core service，不绑定具体 React 组件。
- 终端输出使用 ring buffer，避免无限增长。
- 历史日志按 session 持久化，支持懒加载和截断。
- agent session 可 attach/detach，切换页面不杀进程。
- 对每个 execution target 设置并发限制和资源配额。

### 7.3 数据存储

建议从 JSON config 演进为 SQLite：

- workspace、project、remote、task、session 元数据适合结构化查询。
- session log 可按文件或 SQLite 分表存储。
- SQLite 便于全文搜索、索引、事务和迁移。

仍可保留小型 JSON 配置用于启动期设置，但核心状态建议落 SQLite。

## 8. 高扩展性设计

### 8.1 稳定接口

核心接口应围绕能力，而不是具体实现：

```ts
interface ExecutionProvider {
  id: string;
  kind: "local" | "ssh" | "container" | "wsl";
  listFiles(input: ListFilesInput): Promise<ListFilesResult>;
  getGitStatus(input: GitStatusInput): Promise<GitStatusResult>;
  spawnTerminal(input: SpawnTerminalInput): Promise<TerminalSession>;
  runCommand(input: RunCommandInput): AsyncIterable<CommandEvent>;
  detectProject(input: DetectProjectInput): Promise<ProjectDetectionResult>;
}
```

### 8.2 Event driven UI

状态变化通过事件流通知 renderer：

- workspace updated
- project metadata updated
- terminal output
- terminal exit
- agent status changed
- task changed
- remote health changed

这样可以避免 renderer 频繁主动轮询，并支持未来多窗口、多设备或 web client。

### 8.3 Agent adapter

不同 agent CLI 的启动方式不同，但 UI 需要统一：

```ts
interface AgentAdapter {
  id: string;
  label: string;
  detect(): Promise<AgentAvailability>;
  buildLaunchCommand(input: AgentLaunchInput): CommandSpec;
}
```

第一阶段可以只标准化启动命令。后续再考虑解析 agent 输出、任务状态回写、计划/补丁摘要等高级能力。

## 9. 技术架构取舍

### 9.1 继续使用 Electron

优点：

- 与现有代码兼容。
- 桌面终端、文件系统、系统 SSH、Keychain 集成方便。
- React UI 迭代快。

缺点：

- 长期运行后台任务过多时，main process 复杂度会上升。
- 多 remote、多 session、大量日志需要更清晰的服务边界。

结论：保留 Electron 作为桌面 shell，但逐步把业务核心从 Electron main 抽出。

### 9.2 Core service 使用 Node.js/TypeScript

优点：

- 复用现有代码和类型。
- 与 npm agent 生态兼容。
- 开发速度快。

缺点：

- CPU 密集扫描、大量并发 IO、长期 daemon 稳定性可能需要额外治理。

结论：中期优先选择 TypeScript core service，先把边界做对。

### 9.3 Core service 使用 Rust 或 Go

优点：

- 更适合高并发、低资源占用、长期运行。
- 更容易做跨平台单二进制 helper。

缺点：

- 重写成本高。
- 与现有 TypeScript 类型和 Electron IPC 集成成本更高。

结论：不要立即重写。等 provider 边界稳定后，可以把 remote helper、scanner、session supervisor 这类性能敏感模块拆成 Rust/Go。

## 10. 推荐路线图

### Phase 1: Workspace 模型落地

- 引入 workspace 数据模型。
- 将 configured roots 归属到 workspace。
- Project 使用 `ProjectRef`，保留 local path 作为 local provider 的 URI。
- Agent CLI 升级为 agent profile。
- UI 上形成 workspace -> project -> session 的层级。

### Phase 2: Project detector pipeline

- 抽出 detector 接口。
- 支持 JS/Python/Go/Java/Rust 的基础识别。
- 输出统一 dev service、test command、package manager、framework metadata。
- 保留普通 Git repo fallback。

### Phase 3: Task store

- 引入 SQLite。
- 增加 workspace task CRUD。
- task 可关联 project、branch、agent session。
- agent launch 时可选择绑定 task。

### Phase 4: Execution provider 抽象

- 将现有本地 terminal、Git、file tree、service 能力迁入 `LocalExecutionProvider`。
- renderer 和业务层只面向 provider capability。
- 为 remote provider 留出 URI、权限、缓存和错误模型。

### Phase 5: SSH remote project

- 添加 remote computer 配置。
- 支持连接测试和 remote root 配置。
- 支持打开 remote project。
- 支持远程 terminal 和 agent CLI。
- 支持远程 Git 状态和文件树。

### Phase 6: Core service / extension runtime

- 拆出 core service。
- 加 event bus。
- 统一 session supervisor。
- 插件化 detector、agent adapter、task sync。
- 评估 Rust/Go remote helper。

## 11. 当前代码影响点

当前代码里需要重点演进的模块：

- `src/shared/types.ts`：新增 workspace、project uri、execution target、task、agent session 类型。
- `src/main/config.ts`：从 app config 演进为 workspace config/store。
- `src/main/scanner.ts`：拆为 scanner + detector pipeline。
- `src/main/git.ts`：变成 local provider 的 Git capability。
- `src/main/project-files.ts`：变成 local provider 的 file capability。
- `src/main/terminal.ts`：变成 local provider 的 terminal capability，并预留 remote session。
- `src/main/agent-clis.ts`：升级为 agent profile / adapter registry。
- `src/shared/ipc-channels.ts`：按 workspace/provider/session/task 能力重组 IPC。
- `src/renderer/workflow.ts` 和 `src/renderer/App.tsx`：UI 信息架构从 project list 扩展为 workspace cockpit。

## 12. 主要风险

- 过早插件化导致抽象复杂，拖慢核心体验。
- remote computer 如果直接用 shell 字符串拼接命令，会带来安全风险。
- 任务管理如果一开始做得太重，会偏离 agent workbench 的核心价值。
- 多语言 detector 容易变成规则堆积，需要严格插件边界和测试 fixture。
- 终端/agent session 如果绑定 UI 生命周期，会导致切页面丢状态。
- Electron main process 如果继续承载所有长期任务，会逐步难以维护。

## 13. 建议决策

建议当前不换掉 Electron，也不立即重写为 Rust/Go。更稳妥的路径是：

1. 保留 Electron + React 作为桌面体验。
2. 先引入 workspace、project URI、execution provider 三个核心抽象。
3. 把本地能力迁移为 `LocalExecutionProvider`。
4. 在这个边界上实现 SSH remote project。
5. 当 session、remote、task 复杂度上来后，再拆 core service。
6. 性能敏感模块最后再用 Rust/Go helper 增强。

这样可以在不推倒重来的情况下，逐步获得高性能、高扩展性和远程开发能力。
