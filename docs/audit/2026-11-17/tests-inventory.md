# 测试文件分类与阅读范围

基线：`2fc9c935892d04748c01579f819da701eb163150`。82个 `.test.ts` 共9751行；另完整阅读 `tests/helpers.ts`。本分项不运行测试。

阅读深度：43个全文人工检查；9个长文件关键段抽样；其余30个做静态结构初筛，未声称全文检查。结构初筛使用只读文本提取 imports、测试标题及mock/临时文件/进程线索，结果仅是分类候选，不能证明副作用不存在或断言有效。资源审查员另完成20份全文补审并在resource-lifecycle.md逐项记录；状态审查员另完成19份全文补审并在tests-state-ui-review.md逐项记录。团队全文覆盖82/82，分工为本审查员43、资源审查员20、状态审查员19；此覆盖不代表动态测试全部通过。

| 文件 | 行数 | 静态类型与需注意的边界 | 本分项阅读深度 |
| --- | --- | --- | --- |
| `agent-clis.test.ts` | 87 | 临时文件候选 | 全文 |
| `agent-detector.test.ts` | 47 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `agent-session-reader.test.ts` | 31 | 临时文件候选 | 全文 |
| `agent-session-restore.test.ts` | 60 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `agent-status-attribution.test.ts` | 73 | 部分Agent runtime，watcher/socket启动mock；非完整ApplicationRuntime | 全文 |
| `agent-status-coalescing.test.ts` | 157 | 临时文件候选 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `agent-status.test.ts` | 567 | 临时文件候选；进程或探测调用候选，需人工确认 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `app-update-lifecycle.test.ts` | 129 | mock/spy边界 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `app-updates.test.ts` | 121 | mock/spy边界 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `application-menu.test.ts` | 116 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `artifact-runs.test.ts` | 167 | 临时文件候选；进程或探测调用候选，需人工确认 | 抽样：1–70 ；状态审查员全文补审，见tests-state-ui-review.md |
| `browser-tab-close.test.ts` | 69 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `browser-tabs.test.ts` | 148 | mock/spy边界 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `build-config.test.ts` | 84 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `caffeinate-mode.test.ts` | 19 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `caffeinate.test.ts` | 81 | mock/spy边界 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `codegraph-manager.test.ts` | 308 | 临时文件候选 | 抽样：1–85 ；资源审查员全文补审，见resource-lifecycle.md |
| `codegraph-manual-index.test.ts` | 20 | 只读源码AST检查；不是运行行为验证 | 全文 |
| `codex-input-state.test.ts` | 199 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `codex-sessions.test.ts` | 59 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `config-migration.test.ts` | 109 | 临时文件候选 | 全文 |
| `core-agent-list.test.ts` | 83 | 临时文件候选；进程或探测调用候选，需人工确认 | 全文 |
| `core-detectors.test.ts` | 38 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `core-provider-registry.test.ts` | 30 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `core-runtime.test.ts` | 26 | core对象生命周期；终端退出mock | 全文 |
| `dev-services.test.ts` | 156 | 临时文件候选 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `diagnostics.test.ts` | 58 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `file-boundaries.test.ts` | 29 | 临时文件候选 | 全文 |
| `git.test.ts` | 41 | 临时真实Git仓库；继承Git环境 | 全文 |
| `github.test.ts` | 208 | mock/spy边界；进程或探测调用候选，需人工确认 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `harness.test.ts` | 731 | 临时文件候选；进程或探测调用候选，需人工确认 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `hook-sessions.test.ts` | 140 | 临时文件候选；mock/spy边界 | 抽样：1–70 ；状态审查员全文补审，见tests-state-ui-review.md |
| `hook-snapshots.test.ts` | 35 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `hooks-connectors.test.ts` | 137 | 临时Agent配置；安装路径重定向 | 全文 |
| `install-tool.test.ts` | 165 | 安装命令与机器profile被替身拦截；不是实际安装 | 全文 |
| `ipc-channels.test.ts` | 110 | 进程或探测调用候选，需人工确认 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `island-auto-expand.test.ts` | 221 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `job-scheduler.test.ts` | 54 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `jsonl-reader.test.ts` | 43 | 临时文件候选 | 全文 |
| `local-provider.test.ts` | 47 | 临时文件候选 | 全文 |
| `node-detector.test.ts` | 61 | 临时文件候选 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `opencode-hooks.test.ts` | 155 | 临时文件候选 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `path-safety.test.ts` | 26 | 临时文件候选 | 全文 |
| `plugin-host.test.ts` | 56 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `plugin-manifest.test.ts` | 46 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `profile-cache.test.ts` | 29 | 临时文件候选；进程或探测调用候选，需人工确认 | 全文 |
| `profile-lock.test.ts` | 91 | 临时锁与受控Node子进程；非应用启动 | 全文 |
| `profile-orchestrator.test.ts` | 153 | 临时文件加真实LocalProvider机器探测；需要分离 | 全文 |
| `project-files.test.ts` | 80 | 临时文件候选 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `project-icons.test.ts` | 37 | 临时文件候选 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `prompt-search.test.ts` | 54 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `prompt-store.test.ts` | 74 | 临时文件候选 | 全文 |
| `python-detector.test.ts` | 27 | 临时文件候选 | 全文 |
| `reasonix-hooks.test.ts` | 139 | 临时文件候选 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `renderer-workflow.test.ts` | 76 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `review-control-server.test.ts` | 132 | 临时Unix socket与部署CLI子进程 | 抽样：1–80 ；资源审查员全文补审，见resource-lifecycle.md |
| `review-runs.test.ts` | 337 | 临时文件候选；进程或探测调用候选，需人工确认 | 抽样：1–65 ；资源审查员全文补审，见resource-lifecycle.md |
| `runtime-packaging.test.ts` | 30 | 临时文件与Electron Builder复制库；不启动Electron | 全文 |
| `scanner.test.ts` | 116 | 临时文件候选；进程或探测调用候选，需人工确认 | 仅结构初筛，未全文 ；资源审查员全文补审，见resource-lifecycle.md |
| `task-detail-helpers.test.ts` | 109 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `task-runtime-install.test.ts` | 66 | 临时文件候选；mock/spy边界；进程或探测调用候选，需人工确认 | 全文 |
| `task-runtime.test.ts` | 27 | mock/spy边界 | 全文 |
| `tasks.test.ts` | 231 | 临时文件候选 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `teamwork-sync.test.ts` | 329 | 临时bare远端与本地Git；临时改process.env | 抽样：1–100及环境保存恢复段 ；资源审查员全文补审，见resource-lifecycle.md |
| `telegram-ansi.test.ts` | 41 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `telegram-api.test.ts` | 68 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `telegram-dispatch.test.ts` | 44 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `telegram-pairing.test.ts` | 74 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `telegram-render.test.ts` | 108 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `telegram-service.test.ts` | 23 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `telegram-session-registry.test.ts` | 66 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `telegram-transcript.test.ts` | 258 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `telegram-turn.test.ts` | 115 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `terminal-approval-detector.test.ts` | 151 | 逻辑/注入fixture候选；导入副作用需核对 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `terminal-bootstrap.test.ts` | 115 | 临时文件候选；mock/spy边界 | 仅结构初筛，未全文 ；状态审查员全文补审，见tests-state-ui-review.md |
| `terminal-close-resize.test.ts` | 77 | 源码提取+VM执行真实handler；上下文为mock | 全文 |
| `terminal-state.test.ts` | 86 | 逻辑/注入fixture候选；导入副作用需核对 | 全文 |
| `terminal.test.ts` | 457 | 临时文件候选 | 抽样：1–95 ；状态审查员全文补审，见tests-state-ui-review.md |
| `token-usage-collector.test.ts` | 136 | 临时会话+mock数据库；homedir spy恢复 | 抽样：1–130 ；资源审查员全文补审，见resource-lifecycle.md |
| `token-usage-db.test.ts` | 61 | 纯JS映射/计算；不执行SQLite SQL | 全文 |
| `web-runtime-integration.test.ts` | 314 | 完整runtime、HTTP/WS、真实PTY；禁止当前直接运行 | 抽样：1–110及setup/teardown、spy相关行 ；资源审查员全文补审，见resource-lifecycle.md |
| `web-runtime-security.test.ts` | 73 | 临时文件候选 | 全文 |
