---
kind: sharkbay_task
taskId: C7R4N8-u3960864-m464da1
taskTag: C7R4N8
mode: task
title: 在本机提取 Core 创建与方法分发边界
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-13T11:59:37Z
updatedAt: 2026-11-13T12:05:46Z
completedAt: 2026-11-13T12:04:03Z
---

## Summary
已完成 M1 第一项本机迁移：Core 工厂和 27 项内部请求分发独立于 Electron，utility host 复用该实现。普通 Node 加载/调用、类型检查、442 项测试及构建通过；未提交、未部署，M1 整体仍在实施。

## Files
- docs/webui-runtime-plan.md
- electron/core-host.ts
- src/core/core-runtime.ts
- tests/core-runtime.test.ts

## Work
- 承接 M0K8R4-u3960864-m464da1 的 M0 本机可行性与正式域名证据；用户明确先在本机完成全部开发，最后部署 103。
- 已搜索只读团队上下文，关联 Q4R8T2-u3960864-m81ae10 的退出顺序要求；使用 CodeGraph 定位 Core 服务与 Electron host/client。
- 计划最小提取创建/分发代码；先验证新边界的请求结果、未知方法和错误转换，再运行相关测试、类型检查及构建。
- 已将 27 个内部方法映射及服务工厂提取至 src/core/core-runtime.ts，Electron host 只保留 parentPort 消息/事件适配与 ready；业务实现和退出顺序未改。
- 新增 7 项契约测试，覆盖普通 Node 可用的工厂、同步/异步结果、参数转发、内部错误及未知/原型方法拒绝。
- 计划已记录“全部本机开发完成后才部署 103”，M0 本机可行性任务完成；103 npm DNS/gh/原生模块等事项后置部署。
- 实际 Node 加载构建产物并调用 readDiagnostics 成功，process.versions.electron 与 process.parentPort 均不存在；没有复制业务服务或引入第二套 Core。
- 最终仅改 Core host、增加公共内部工厂/分发模块与契约测试，并更新计划；ApplicationRuntime、网络入口和宿主互斥仍按后续任务推进。
- 尝试暂存本任务改动时遇到工作树 index.lock，重试仍存在；只读检查未发现 git 进程，未删除该锁或强行操作索引。源文件均已保留，部分先前改动仍在暂存区，本任务代码尚未暂存，不影响已完成的本机验证。

## Verification
- 开始时 Git 改动为此前任务的计划、清单和探测脚本；本任务保留它们。
- 相关 4 个测试文件、13 项测试通过。
- 首次 typecheck 指出测试 afterEach 回调返回 VitestUtils，改为 void 回调后 npm run typecheck 通过。
- 首次全量测试：441 通过、1 失败（原有 terminal.test.ts 通知输出超时）；继续单独复现及检查，尚不宣称全量通过。
- 该终端通知测试单独复跑通过（1 通过、12 跳过）；不修改测试或超时阈值。
- 第二次 npm test：67 个文件、442 项测试全部通过，退出 0。首次超时保留为偶发测试记录。
- npm run build 退出 0；普通 Node 导入 dist-electron/src/core/core-runtime.js 并调用真实诊断返回对象，PLAIN_NODE_CORE_OK。
- git diff --check 退出 0；变更 diff 已核对，27 个显式内部方法由 CoreMethodMap 类型约束。
- 计划的 19 个链接均通过存在性检查；git diff --cached --check 退出 0。git add 两次退出 128（index.lock exists），未提交。

## Notes
- 仅 M1 第一项，不等于应用编排、宿主互斥或独立 Node 产品入口已完成；不把内部 Core RPC 暴露到网络。
- 全部开发与验证在本机；103 的运行环境和域名后端路由在最终部署阶段准备。
- 首次终端超时发生在全量测试与类型检查并行时，独立复跑和测试单独全量复跑均通过；未确认根因，不将其记为已修复问题。
