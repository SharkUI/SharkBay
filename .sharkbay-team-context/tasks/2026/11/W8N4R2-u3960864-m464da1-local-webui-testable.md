---
kind: sharkbay_task
taskId: W8N4R2-u3960864-m464da1
taskTag: W8N4R2
mode: task
title: 推进到本机可实际测试的独立 WebUI
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-13T13:29:55Z
updatedAt: 2026-11-13T14:49:20Z
completedAt: 2026-11-13T14:49:20Z
---

## Summary
纯 WebUI 已可在本机实际试用：Node 为唯一宿主，Electron 源码/依赖/打包及原生入口已移除，项目、终端/Agent、文件/Git、任务与编排接入受保护的浏览器工作台。已完成自动回归及 Chrome 主流程验证，默认独立 Web profile 已启动；103/LAN 部署留到后续，未创建提交。

## Files
- .sharkbay/tasks/W8N4R2-u3960864-m464da1-local-webui-testable.md
- src/core/core-runtime.ts
- src/runtime/agent-runtime.ts
- electron/ipc.ts
- tsconfig.node.json
- src/runtime/task-runtime.ts
- electron/（按用户明确要求移除）
- src/main/ 的 Electron 专属模块及对应桌面测试
- package.json
- package-lock.json
- src/runtime/application-runtime.ts
- src/runtime/profile-lock.ts
- src/runtime/terminal-state.ts
- src/shared/application-api.ts
- src/shared/application-events.ts
- src/shared/types.ts
- src/core/core-service.ts
- src/core/core-protocol.ts
- src/core/execution-provider.ts
- src/providers/local/local-provider.ts
- src/main/terminal.ts
- src/main/agent-clis.ts
- src/main/hooks/bridge.ts
- src/main/harness.ts
- src/plugins/plugin-host.ts
- src/server/
- src/renderer/
- src/styles/app.css
- tests/web-runtime-security.test.ts
- tests/web-runtime-integration.test.ts
- tests/build-config.test.ts
- tests/harness.test.ts
- README.md
- docs/development.md
- docs/webui-runtime-plan.md
- docs/webui-runtime-api-inventory.md
- scripts/inspect-webui-api.mjs
- scripts/verify-webui-runtime.mjs

- docs/architecture.md
- docs/testing.md
- docs/release.md
- docs/index.md
- scripts/README.md

## Work
- 承接 C7R4N8-u3960864-m464da1、N4K8V2-u3960864-m464da1：Core 工厂/分发、独立编译与真实 PTY 纵切片已具备；本轮不再以单个内部探测作为终点。
- 已搜索只读团队上下文、核对当前 Git 状态；保留已有改动和索引锁，不覆盖其他任务的文件内容。
- 采用 design-semantic-interfaces：浏览器仍操作同一运行主机的项目、终端和任务；连接是状态，桌面能力按声明隐藏，不新增用户模式或导航世界。
- 完成条件：独立启动命令、运行时生命周期/路径注入、受保护的 loopback 入口、Web bridge 与现有工作台，项目/文件/Git/任务/真实终端与 Agent 编排主流程可实际操作；真实渲染与端到端检查通过，给用户可直接访问的入口。
- 正在从 Electron IPC 迁出 Hooks、终端状态关联、Review/Artifact 管理及控制 socket 到共享 agent-runtime；桌面改为调用共享实现，并保留 Telegram/Island 的宿主回调。
- 增加进程内 CoreConnection 适配，复用已有分发器和事件；Node 关闭按取消 CodeGraph→关闭 PTY 执行。
- 用户明确此 worktree 只做纯 WebUI、不保留 Electron；取消桌面兼容/双入口验收要求，移除 Electron 入口、依赖、构建与原生 UI。共享服务已迁出的业务保留，Node 成为唯一宿主。
- 纯 Web 分支不再需要 Node/Electron ABI 双目录并用；根依赖改为普通 Node 安装，后续部署仍在功能完成之后。
- Node 应用运行时接入配置、Core 项目/文件/Git、Hooks、任务、Review/Artifact、用量；增加配置/数据目录互斥，控制 socket 按 profile 隔离，关闭会等待状态扫描后清理资源。
- HTTP/WS 本机入口使用短时一次性连接凭证、HttpOnly SameSite Cookie、Host/Origin 与请求头检查、明确方法/输入字段白名单、有界请求去重及客户端输出队列。
- 终端运行时增加会话枚举、headless 屏幕快照、输出序号及控制连接；连接关闭释放控制权，不关闭 PTY。HTML 预览使用响应级 sandbox/CSP，无应用 bridge。
- 公共应用契约不再依赖内部 Core 类型；插件摘要和终端事件类型开始收拢到 shared。

- Web bridge 已接入 HTTP 命令/WS 事件；页面刷新改为枚举并附着已有 PTY，禁止恢复时重新执行 Agent。正在补连接状态、观察/接管与桌面控件清理。

- 已移除 BrowserView/原生查找/分享 UI 及 bridge；浏览器链接使用普通标签，Artifact 使用隔离预览。主机项目由 CLI 配置，界面不提供失效的本机目录对话框。
- 新增连接状态栏、断线操作保护、终端观察/接管；控制端 resize 广播新快照，运行时关闭等待 PTY 退出并逐项释放资源。配置初始化移至 profile 锁之后。

- 文档、主 README 和 API 清单已改为纯 Web 命令与架构；删除旧双入口/双 ABI 使用说明。Artifact 辅助脚本由 PTY 注入当前 profile 的 CLI 路径，不再查找桌面 Application Support。

- Chrome 实际渲染检查已贯通项目、真实终端命令、编辑保存、任务详情、刷新与第二标签观察/接管；刷新前后 shell PID=30848，未重复启动。发现并修复普通 Node 加载 xterm CommonJS 导出的差异，补回 Web 设置入口及观察端 prompt 禁用。
- 终端显式关闭增加公共更新，其他浏览器同步移除标签；删除旧浏览器 localStorage 屏幕快照机制，唯一恢复来源改为主机屏幕。

- 新增 artifacts.start 公共命令：仅接收 repo/task/agent 标识，由主机查任务、分配结果路径并启动；浏览器不再提交私有 bootstrap/输出路径。完成通知提供明确预览链接，避免异步弹窗被拦截。
- 新增 verify:webui，实际执行编译后的 Node CLI、静态资源、授权、WS、真实 PTY 与停止清理；本地桌面 Chrome 已证明 Claude 安全模式 TUI 草稿刷新后完整恢复，未提交模型请求，关闭测试终端后无对应 CLI 进程。

- 核对依赖树已无 Electron；补充配置文件本身为 symlink 的互斥测试。清理当前架构/测试/发布文档中失效的桌面命令，保留历史设计参考。Chrome 控制接口后续失去窗口，IAB host 同样不可用，已如实记录；此前实际界面主流程验收有效。

- Web bridge 增加连接对象清理、断线后的授权状态探测与会话列表核对，避免新授权后保留已失效 PTY 标签；将真实 bridge 纳入 HTTP/WS 集成测试，覆盖凭证 fragment 清除、实际输入/快照、撤销拒绝输入和新链接恢复。

- 补回纯 Web 的终端查找按钮与 Ctrl/Cmd+F，不再依赖原生菜单事件；主机配置独立复制、原有项目保留，当前 worktree 将注册到 Web profile 供本机试用。

- 本机交接服务以 `npm start -- --project /Users/shark/Projects/SharkBay-feature-webui-runtime` 启动在 127.0.0.1:5185，profile 为 ~/.sharkbay/webui；通过真实授权/WS/API 确认当前 worktree 与本任务可见，保留运行供用户试用。

## Verification
- 起始工作区与当前目标已核对；尚未开始本轮实现验证。

- `npm run typecheck`、`npm run build`、`npm test` 通过（60 文件、395 项）；新增网络安全/真实 PTY 集成测试正在接入。

- 新增 11 项网络/互斥测试通过：授权过期/撤销/限速、Host/Origin/WS/CSRF、路径和 symlink、隔离预览、创建去重、双客户端控制权、相同 PID 恢复与停止清理。旧 Harness 路径断言已按新契约更新，完整检查重跑中。

- 完整检查通过：typecheck、62 文件/406 项测试、build、verify:runtime。真实 Node 产品启动发现的 CommonJS 导入问题已修复；将补编译产物启动回归避免仅依赖 Vitest 打包行为。

- 最新全量测试通过（62 文件、407 项）、build 与编译产物 verify-webui-runtime 通过；新增 Artifact 测试使用真实 PTY 与替身 Agent，不调用模型，验证主机派生路径和关闭事件。

- `npm ls --depth=0` 正常，无 Electron 依赖；最新 verify:webui（完整构建与普通 Node 产品启动/关闭）及 diff --check 通过。临时浏览器 fixture/profile、测试 PTY/Claude、安全模式草稿和源码备份均已清理。

- 最终检查通过：`npm run typecheck`、`npm test`（62 文件/408 项）、`npm run verify:webui`（完整构建 + 普通 Node CLI/静态资源/授权/WS/PTY/SIGTERM）、`git diff --check`；真实 Web bridge 授权、快照、撤销和新链接恢复测试通过。

- 最终默认 profile 验证输出 LOCAL_HANDOFF_OK：16 条配置、15 个可扫描项目，当前 worktree 与 W8N4R2 任务可见；未清除原有无效项目配置。默认服务已运行，临时验收服务已停止。
- Chrome 主流程有实际渲染证据；桌面控制接口后续失效，最后补充的终端查找/Artifact 预览链接未进行第二次 CUA 复验，连接/编排/预览响应由自动测试验证。未向真实模型提交 Review/Artifact 请求；模型运行结果由用户试用。

## Notes
- 所有开发、测试在当前本机；最终在 103 运行、使用 ai.shark.zj.cn，sharkbay.xyz 托管服务不在本轮范围。
- 浏览器关闭不应关闭 PTY；内部 Core RPC 不直接开放网络，运行路径由主机入口注入。
