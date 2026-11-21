---
kind: sharkbay_task
taskId: Q8R5N2-u3960864-m464da1
taskTag: Q8R5N2
mode: task
title: 全面审查并精简纯 WebUI 代码与架构
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-13T15:10:28Z
updatedAt: 2026-11-13T15:55:59Z
completedAt: 2026-11-13T15:55:59Z
---

## Summary
完成纯 WebUI 代码审查与清理：相对本轮基线净减 7446 行代码/样式/测试/脚本，移除 39 个文件，统一契约与职责边界，修复多项目同步、终端生命周期及文件越界缺陷。类型、297 项测试、编译入口端到端验收通过；浏览器视觉回验因本机 CUA 无窗口而未完成，未宣称界面已回验。

## Files
- src/main/telegram/、caffeinate.ts、secrets.ts、project-clone.ts、token-usage-pricing.ts
- src/main/hooks/cli/sharkbay-hook.ts
- src/plugins/installed-plugins.ts、plugin-manifest.ts
- src/shared/types.ts、application-api.ts、caffeinate.ts
- src/main/config.ts
- src/renderer/App.tsx、types.ts、bridge/
- src/core/core-runtime.ts、core-protocol.ts
- src/runtime/、src/server/
- src/styles/app.css
- tests/、scripts/、package.json、package-lock.json、tsconfig*.json
- docs/architecture.md、product.md、testing.md、webui-runtime-plan.md、webui-runtime-api-inventory.md

- src/renderer/settings-view.tsx、icons.tsx、ui.ts、agent-preferences.ts
- src/main/path-safety.ts、file-content.ts、tasks.ts、token-usage-db.ts
- src/runtime/application-input.ts（从 server 迁入）
- tests/terminal-state.test.ts、task-runtime.test.ts、file-boundaries.test.ts
- scripts/check-source-graph.mjs
- resources/*.icns、旧 Dock PNG（删除）；保留在用的项目图标

- docs/development.md、agents.md、src/main/harness.ts、tests/harness.test.ts

- scripts/build-runtime.mjs

## Work
- 承接 W8N4R2-u3960864-m464da1，用户已确认本机可用；本轮明确授权清理现存死代码、无效状态/测试与桌面遗留，并按架构清晰和代码精简审视整个实现。
- 已阅读协议、AGENTS，搜索只读团队上下文；I3D7K9/C9H4QX 的 Island/桌面状态逻辑属于历史参考，不作为本分支功能保留要求。现有未提交的 WebUI 迁移改动作为基线保留。
- 验收：引用分析与编译无未使用项；契约/生命周期简化后相关和全量测试通过；普通 Node 编译产物可启动、HTTP/WS/PTY 流程通过；验证主要浏览器交互，记录审查发现和实际清理范围。
- 计划：建立可达性与状态清单 → 分批删除/简化并验证 → 全量回归、启动验收与文档收尾。不部署 103，不创建新产品能力。

- CodeGraph 已同步；从服务/浏览器两个入口构造 TS 依赖图，确认 19 个生产文件不可达。noUnused 编译暴露 38 项未使用声明/参数；发现 Telegram 隐藏 UI、BrowserView 重复类型、Mac 钥匙串/防休眠及空 pricing/插件加载占位。
- 将删除旧 Core 消息/错误序列化和字符串分发表，改为进程内强类型直接调用；公共网络白名单保持在应用边界，输入验证从 server 迁到 runtime，消除运行时反向依赖 HTTP。

- 已删除不可达的 Telegram、Mac 防休眠/钥匙串、重复 Hook CLI、安装插件占位和空 pricing，以及对应失效测试/探测脚本；npm 移除 Telegram 依赖及其 51 个传递包。
- 浏览器桥仅保留实际实现的必选方法，命令参数/结果直接从公共 API 派生；领域 DTO 统一使用 shared，移除约 700 行前端副本及后端 Task/Usage 副本。
- 删除 BrowserView 专属三栏切换状态、旧恢复文本、空的 bridgeAvailable 分支、无消费者的 props/refs/组件，以及仅供旧自动根扫描的递归扫描路径。
- 审查发现任务同步还依赖“唯一当前项目”，多个浏览器查看不同项目会互相停止同步；改为按 repo 管理实例，统一在宿主退出时关闭，补针对回归。

- 主文件从 6240 行拆至约 4200 行：设置页、共用图标/界面工具、Agent 偏好独立成职责明确的模块；终端当前项目由选择推导，删除 Island 聚焦接口和永不填充的恢复 Set。清除 242 条无消费者 CSS 规则及桌面资源。
- 修复终端队列失败后不再消费、延迟 resize 越过控制权接管、关闭后迟到输出重建屏幕，以及退出与进行中命令的竞态；补队列/生命周期/多项目同步回归。Hooks 设置改为等待主机成功再保存本地状态，避免 UI 假成功/未处理 Promise。
- 文件边界三个用例修复前均失败：缺失文件通过 symlink 父目录越界、根目录被当作文件、重命名吞掉校验并允许同前缀相邻路径；现统一真实父路径检查并限定重命名为文件名。
- 开启全项目 noUnusedLocals/noUnusedParameters；构建同时校验 host/browser 依赖方向和零不可达生产模块，防止桌面残留再生。

- 收尾核对发现批量启用 Hooks 仍未等待异步结果，以及 Usage 查询失败会产生未处理拒绝；补齐等待/错误状态，避免显示假成功或旧范围数据。同步更新纯 WebUI 的架构、产品定位、开发命令与生成的协议预览描述。

- 构建先清空旧 runtime 输出，防止删除的模块继续残留在编译目录；编译入口验收增加 config.get 与项目扫描，覆盖新契约。当前旧实例有 3 个会话，保持进程运行，切换新版需要结束会话后重启。

- 编译入口新增配置/扫描断言发现旧验收会复制真实主机配置；已改为显式临时配置，仅扫描临时 Git 项目，完全不写真实配置。

## Verification
- 上轮基线：62 文件、408 项测试、typecheck、build、verify:webui 通过；本轮重新确认中。

- 类型检查与全量测试通过（53 文件、297 项）；已移除失效/未接入功能对应测试，并补实际回归，计数不与旧功能测试混比。verify:webui 编译产物入口、授权、WS/真实 PTY 和退出清理通过；CSS 从约 127 KB 降至 95 KB。
- 独立 TS 入口图分析当前不可达生产文件为 0；相对本轮起点，src/tests/scripts 文本净减约 7600 行（含新增回归与模块拆分，精确数收尾复核）。
- CUA 浏览器 host 不可用且 Chrome cgWindowNotFound，已异步询问桌面状态；其余检查继续进行。

- 收尾回归发现一条新预览文案断言与实际词序不符（296/297 通过）；修正断言后重新跑全量。再次尝试 CUA 仍为 browser host unavailable / cgWindowNotFound，无法完成本轮视觉回验。

- 最终：npm run typecheck、npm test（53 文件/297 项）、npm run verify:webui、git diff --check 均退出 0。编译入口额外通过配置读取、项目扫描、授权、WS/PTY 输出与 SIGTERM 后 PID/锁清理。清空重建后 dist-runtime 不含已删除的 Telegram/caffeinate/Core 协议等模块。
- 精确收尾统计：src/tests/scripts 的 .ts/.tsx/.mjs/.css 从 39139 行减至 31693 行，净减 7446 行；39 个原文件删除（含移动/替换）；浏览器 CSS 产物 95.07 KB。无本轮提交。

## Notes
- .sharkbay/team-context/ 只读；不抢占既有 Git 索引锁，不自动创建提交。
- 默认本机试用服务仍在运行；清理期间不关闭用户当前终端，需重载新构建时先检查会话再安排。

- 旧试用实例仍加载上一版服务代码，且有 3 个活动终端；为保留会话没有重启。新版 config.get 等契约需服务与浏览器统一切换，结束会话后重启再刷新，避免新静态页面连接旧服务。视觉回验待桌面访问恢复后补做。
