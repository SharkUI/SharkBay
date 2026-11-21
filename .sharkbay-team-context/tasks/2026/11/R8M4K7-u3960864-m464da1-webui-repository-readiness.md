---
kind: sharkbay_task
taskId: R8M4K7-u3960864-m464da1
taskTag: R8M4K7
mode: task
title: 梳理 WebUI 实施前的仓库基线与边界
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-13T08:49:31Z
updatedAt: 2026-11-13T08:51:05Z
completedAt: 2026-11-13T08:51:05Z
---

## Summary
已完成 WebUI 实施前的仓库盘点：确认已有工作归属、业务与 Electron 耦合点、构建和测试入口，记录最小整理顺序。当前 worktree 缺少 tsc/vitest，尚未建立通过的验证基线；仅新增本任务记录，未改产品代码、安装依赖或提交。

## Files
- .sharkbay/tasks/R8M4K7-u3960864-m464da1-webui-repository-readiness.md

## Work
- 已读取任务协议与 AGENTS.md；通过 CodeGraph 查询 SharkBayCoreService，后续代码搜索优先使用 CodeGraph。
- 当前分支 feature/webui-runtime；已有未跟踪 docs/webui-runtime-plan.md 属于 W6R8K2-u3960864-m464da1，保留其内容。
- 已搜索只读团队任务镜像，继续核对相关架构和生命周期任务；计划检查代码边界、构建脚本与验证入口。
- 读取 A6D8QK-u3960864-m81ae10 的历史审计与 Q4R8T2-u3960864-m81ae10 的退出清理记录；历史检查结果不能充当本分支基线，迁移时须保留 CodeGraph 取消、PTY 关闭、utility process 退出的顺序。
- CodeGraph 定位 SharkBayBridge、registerIpcHandlers、CoreMethodMap、TerminalManager、shutdownCore、App/getBridge 和 Electron 导入，再做定点读取。
- 当前 electron/ipc.ts 为 1521 行，持有 Hooks、Review/Artifact、Telegram、用量等应用状态，并直接导入 BrowserWindow/dialog；electron/core-host.ts 同时创建服务、分发方法且依赖 process.parentPort。适合按纵切片提取，避免复制 IPC 或批量移动 src/main。
- SharkBayBridge 在 src/renderer/types.ts 混合业务与桌面能力；App.tsx 为 7013 行，getBridge 无 preload 时抛错。先明确契约和能力声明，不因文件大而提前拆整个 App。
- src/main/browser-tabs.ts、share-popover.ts、share-artifact.ts 含 Electron 运行时导入；application-menu.ts 是 Electron 类型导入。目录位置不能证明可被独立 Node 入口安全加载。
- package.json 的 postinstall 为 Electron 重建 better-sqlite3；tsconfig.node.json 同时包含 Electron、业务、测试和构建配置，且全局加载 Electron 类型。独立 Node 构建与原生 ABI 隔离应在 M0/M1 实施，暂不改现有安装产物。
- 发现 docs/development.md 写开发端口 5173，实际 dev 脚本与 vite.config.ts 为 5184；后续准备环境时可做单独小修，本任务只记录。
- 已有 package-lock.json；现有 typecheck/test/build 脚本与 Core、终端、路径安全、Review/Artifact 测试可复用。建议先补依赖并取得现有桌面检查基线，再完成 M0 契约清单与技术验证，最后在 M1 按业务单元抽取并回归。

## Verification
- git status --short --branch：当前仅有未跟踪计划文档，无已跟踪文件改动。
- 环境：Node v24.14.1，npm 11.11.0，HEAD c293349（chore(release): v0.3.5）。
- npm run typecheck：退出 127，tsc: command not found；检查未执行，不能视为类型通过或代码失败。
- npm test：退出 127，vitest: command not found；测试未执行，未产生通过数。
- git diff --stat 无输出；git diff --check 通过。未安装依赖、运行构建或打包，也未执行 M0/真实设备验收。
- git check-ignore 确认任务目录被忽略，任务记录需通过 Task Protocol 管理；计划文档仍未跟踪，应在正式实现前纳入可追溯的计划基线。

## Notes
- 团队上下文仅供读取；不移动文件、不清理历史实现、不提交、不实现 WebUI。
- 10.0.0.103 是后续第二设备 LAN 验收目标，本次仓库梳理无需访问设备。
- 本任务完成的是实施前盘点，不代表依赖环境、桌面回归或 WebUI 功能已就绪；不新增平行规划文档，具体发现保留在本记录。
