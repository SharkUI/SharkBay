---
kind: sharkbay_task
taskId: N4K8V2-u3960864-m464da1
taskTag: N4K8V2
mode: task
title: 贯通本机独立 Node Core 纵切片
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-13T12:27:48Z
updatedAt: 2026-11-13T12:37:32Z
completedAt: 2026-11-13T12:37:32Z
---

## Summary
已在本机增加独立 Core 编译边界与 verify:runtime 命令，贯通临时项目扫描、真实 PTY 创建/输入/输出/退出及活动 PTY 清理。导入检查、类型检查、相关 35 项测试及桌面构建通过；不部署、不开放网络，M1 应用编排仍待后续迁移。

## Files
- .sharkbay/tasks/N4K8V2-u3960864-m464da1-node-core-vertical-slice.md
- tsconfig.runtime.json
- package.json
- .gitignore
- scripts/check-runtime-imports.mjs
- scripts/verify-runtime-core.mjs
- docs/webui-runtime-plan.md
- docs/development.md

## Work
- 承接 C7R4N8-u3960864-m464da1：Core 工厂和分发已提取，普通 Node 诊断调用、442 项测试、类型检查和构建通过。
- 已检索只读团队上下文，用 CodeGraph 定位工厂、配置和终端；保留当前所有改动及现有 Git 索引锁，不强制暂存或提交。
- 计划增加不加载 Electron 类型的独立编译边界，使用真实临时 Git 项目验证项目列表、PTY 创建/输入/输出/退出/清理；先检查实际依赖再确定修改文件。
- 已确认配置与 Core 现有接口可复用，先增加编译边界与验证命令，不新增应用 API 包装层。新构建产物使用 dist-runtime，与桌面产物隔离；不会重建根目录原生模块。
- 新增 tsconfig.runtime.json，仅以 Core 工厂为入口、加载 Node 类型；build:runtime 和 typecheck 增加静态依赖检查，输出目录加入忽略。
- 首版检查器误将 Node detector 中的普通 "electron" 字符串当成导入，已改为检查实际 import/export/require 调用和编译依赖文件。
- 新增 verify:runtime：真实临时 Git 仓库与独立配置，经共同分发器扫描项目、创建 PTY、输入命令、捕获输出/退出码，并验证关闭时清理另一个活动 PTY；不输出终端原文。
- 验证脚本在自身进程中清除 Git 路径覆盖变量，确保 Core 的 Git 子命令也使用临时仓库；用户父进程与配置不变。开发文档新增本机独立 Core 编译/验证命令和当前能力边界。
- build:runtime 在发射产物前先检查导入，失败时不生成混入 Electron 的运行时产物；没有改业务实现、原生依赖版本或桌面构建目标。

## Verification
- 开始时 Git 状态已核对，前一任务源码仍有未暂存和未跟踪文件，未覆盖。
- npm run build:runtime 通过；静态依赖图无 Electron 源码、模块或类型。
- 在内存中向 Core 入口注入 Electron import，检查器按预期拒绝；未改项目文件。
- npm run verify:runtime 退出 0：项目列表、PTY 输入/输出、exit=7、活动 PTY 清理、PID 不存在检查均通过，临时目录已清理。
- npm run typecheck 退出 0，含 renderer、桌面和独立 runtime 编译检查及 Electron 导入检查。
- 相关 5 个测试文件、35 项测试通过，包含终端、扫描器、Core 契约、退出清理与构建配置。
- 开发文档/计划的本地链接检查及 git diff --check 通过。
- npm run build 退出 0，原有桌面 TypeScript/Vite 构建成功。
- 人为设置无效的 GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE/GIT_COMMON_DIR 后运行纵切片，退出 0，临时仓库 Git 状态、命令输出和活动 PTY 清理均通过。
- 调整导入检查至编译前后再次运行 build:runtime，退出 0。

## Notes
- 仍为 M1 的增量任务，不等于应用业务迁移或完整运行时交付。
- 开发、构建、测试均在本机；103、ai.shark.zj.cn 的部署接入留到功能完成后。
- 当前仅验证 Core 依赖和 N-API PTY；接入用量 SQLite 等应用服务时仍须继续分离 Node/Electron 原生依赖安装目录，不将根目录 Electron ABI 的 SQLite 当成 Node 依赖。
- 尚未实现应用运行时业务、宿主互斥或 Web 网络入口；现有 Git 索引锁未修改，改动保留在工作区，未提交。
