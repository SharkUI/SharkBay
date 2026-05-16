# Workspace Model

## 1. 目标

Workspace 是 SharkBay 的核心工作边界。它不是简单的项目列表，也不是多个机器的聚合视图，而是：

```text
某一台 machine 上的一个工作目录，以及这个目录下的一组 project/module/service。
```

设计目标：

- 支持前后端、微服务、worker、infra 等多个模块放在同一个父目录下协作开发。
- 让 agent 可以在 workspace root 下工作，从而一次性修改多个工程。
- 让用户也可以切到具体 project，让 agent 聚焦单个模块。
- 避免一个 workspace 横跨多台 machine 带来的 cwd、文件系统、权限、终端语义复杂度。

## 2. 核心决策

### 2.1 一个 workspace 绑定一个 execution target

每个 workspace 必须绑定一个 machine / execution target。

```text
Workspace -> ExecutionTarget
```

Execution target 可以是：

- local machine
- SSH remote machine
- future container / WSL / devbox

但一个 workspace 内只能有一个 target。

这意味着：

```text
同一个 workspace 下的所有 project 都在同一台 machine 上。
```

### 2.2 一个 workspace 有一个 root URI

Workspace 必须有一个 root URI：

```text
workspace.rootUri
```

例子：

```text
local:/Users/laibao/Code/ai-platform
ssh://gpu-01/home/app/ai-platform
```

这个 root URI 是 agent 的 workspace-level cwd。

### 2.3 Project 必须位于 workspace root 内

Workspace 下的 project 必须满足：

```text
project.targetId == workspace.targetId
project.uri is inside workspace.rootUri
```

例子：

```text
Workspace root:
  local:/Users/me/Code/ai-platform

Projects:
  local:/Users/me/Code/ai-platform/frontend
  local:/Users/me/Code/ai-platform/api
  local:/Users/me/Code/ai-platform/worker
```

不允许：

```text
Workspace root:
  local:/Users/me/Code/ai-platform

Project:
  ssh://server/home/app/worker
```

如果项目在另一台 machine，应创建另一个 workspace。

## 3. 领域模型

### 3.1 Workspace

```ts
type Workspace = {
  id: string;
  name: string;
  targetId: string;
  rootUri: string;
  displayPath: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `targetId`：workspace 绑定的 execution target。
- `rootUri`：workspace 根目录 URI。
- `displayPath`：用于 UI 展示的人类可读路径。
- `projectIds`：workspace 内已识别或手动添加的 project。

### 3.2 ExecutionTarget

```ts
type ExecutionTarget = {
  id: string;
  kind: "local" | "ssh" | "container" | "wsl";
  label: string;
  status: "available" | "unavailable" | "auth-required";
  createdAt: string;
  updatedAt: string;
};
```

第一阶段只需要：

```text
local
```

第二阶段支持：

```text
ssh
```

### 3.3 Project

```ts
type Project = {
  id: string;
  workspaceId: string;
  targetId: string;
  name: string;
  uri: string;
  displayPath: string;
  relativePath: string;
  kind: "repo" | "service" | "package" | "module" | "folder";
  detectedStacks: string[];
  createdAt: string;
  updatedAt: string;
};
```

字段说明：

- `uri`：project 的执行目录 URI。
- `relativePath`：project 相对于 workspace root 的路径，例如 `frontend`、`api`、`.`。
- `kind`：project 类型。MVP 可以都先用 `repo` 或 `folder`。
- `detectedStacks`：检测到的技术栈，例如 `typescript`、`python`、`go`、`spring`。

## 4. Agent 执行范围

Agent session 必须明确 scope。

```ts
type AgentLaunchScope =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; workspaceId: string; projectId: string };
```

cwd 解析规则：

```text
workspace scope -> workspace.rootUri
project scope   -> project.uri
```

例子：

```text
Codex in Workspace
  cwdUri = local:/Users/me/Code/ai-platform

Codex in Project: api
  cwdUri = local:/Users/me/Code/ai-platform/api
```

这让 workspace-level agent 可以同时修改 frontend、api、worker，而 project-level agent 可以聚焦单个模块。

## 5. Prompt 模型

Workspace 可以有 workspace-level prompt。

Project 可以有 project-level prompt。

启动 agent 时，prompt 组合规则可以是：

```text
workspace prompt
+ selected task prompt
+ project prompt, if scope is project
+ agent profile prompt
```

推荐模型：

```ts
type Prompt = {
  id: string;
  workspaceId: string;
  projectId?: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};
```

语义：

- `projectId` 为空：workspace prompt。
- `projectId` 有值：project prompt。

## 6. UI 行为

### 6.1 创建 workspace

创建 workspace 时用户需要选择：

```text
1. Workspace name
2. Execution target: local 或 remote
3. Workspace root directory
```

MVP 可以先只支持 local。

后续支持 remote 时：

```text
1. 选择或新增 remote machine
2. 选择 remote workspace root
3. 扫描该 root 下的 projects
```

### 6.2 打开 terminal / agent

Terminal buttons 应明确 scope：

```text
Workspace Shell
Project Shell
Codex in Workspace
Codex in Project
Claude in Workspace
Claude in Project
```

如果没有选中 project：

```text
Project Shell / Agent in Project 禁用
Workspace Shell / Agent in Workspace 可用
```

### 6.3 Project list

Project list 展示 workspace root 下识别到的 project：

```text
frontend
api
worker
infra
```

每个 project 显示：

- name
- relativePath
- Git 状态
- detected stacks
- dev services
- 最近 agent/task 状态

## 7. 扫描规则

Workspace scanner 从 `workspace.rootUri` 开始扫描。

第一阶段：

- 找 Git repo。
- 找 `package.json`、`pyproject.toml`、`go.mod`、`pom.xml`、`build.gradle`、`Cargo.toml`。
- 输出 project candidates。

重要约束：

```text
scanner 不能越过 workspace root。
scanner 不能把其他 target 的 project 加进来。
```

## 8. 数据存储

建议存储位置：

```text
~/.sharkbay/sharkbay.sqlite
```

MVP 阶段可以临时存在：

```text
~/.sharkbay/config.json
```

但 workspace、project、prompt、task、agent session 很快会超过 JSON config 的适用范围，因此建议尽早迁移到 SQLite。

## 9. 示例

### 9.1 Local workspace

```text
Workspace:
  name: AI Platform
  target: local
  rootUri: local:/Users/me/Code/ai-platform

Projects:
  frontend
    uri: local:/Users/me/Code/ai-platform/frontend
    relativePath: frontend

  api
    uri: local:/Users/me/Code/ai-platform/api
    relativePath: api

  worker
    uri: local:/Users/me/Code/ai-platform/worker
    relativePath: worker
```

### 9.2 Remote workspace

```text
Workspace:
  name: GPU Worker Stack
  target: ssh:gpu-01
  rootUri: ssh://gpu-01/home/app/worker-stack

Projects:
  scheduler
    uri: ssh://gpu-01/home/app/worker-stack/scheduler
    relativePath: scheduler

  model-worker
    uri: ssh://gpu-01/home/app/worker-stack/model-worker
    relativePath: model-worker
```

## 10. 非目标

当前不做：

- 一个 workspace 横跨多台 machine。
- 一个 agent session 同时在多个 machine 上直接执行 shell。
- 跨 machine 的自动任务编排。
- 云端同步 workspace 数据。

如果未来确实需要跨 machine 协作，应新增更高层概念，例如：

```text
Workspace Group
```

而不是让单个 workspace 变成跨机器对象。

## 11. 推荐落地顺序

1. 新增 workspace 数据模型。
2. 当前 `configuredRoots/configuredProjects` 迁移为默认 local workspace。
3. UI 增加 workspace selector。
4. Project scanner 从 workspace root 扫描。
5. Terminal 增加 workspace scope / project scope。
6. Prompt 支持 workspace-level 和 project-level。
7. 引入 SQLite 存储 workspace/project/prompt/task/session。
8. 增加 SSH execution target，并支持 remote workspace。
