---
kind: sharkbay_task
taskId: O7S4K2-u3960864-m81ae10
taskTag: O7S4K2
mode: task
title: Align agent status tracking with Orca
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T07:20:07Z
updatedAt: 2026-11-17T09:17:30Z
completedAt: 2026-11-17T09:17:30Z
---

## Summary
已将本地 agent 状态链路对齐 Orca 的四态执行语义与独立已读提醒，界面统一显示等待、阻塞、完成、失败、中断、空闲及证据过期。接入精确终端身份、异步问题/子任务/后台工作跟踪、结构化终端信号及当前回合 rollout 补偿，完成测试、构建和真实渲染验证；未产生提交或替换已安装 App。所有状态指示已按用户最新指定的蓝/绿/黄/红/灰五组统一，已读、主题与进程退出不改变状态色，项目状态胶囊文字统一为白色。

## Files
- package.json
- src/island/island.html
- src/main/hooks/bridge.ts
- src/main/hooks/cli/sharkbay-hook.ts
- src/main/hooks/connectors/claude-family.ts
- src/main/hooks/state-manager.ts
- src/main/hooks/types.ts
- src/main/telegram/render.ts
- src/main/telegram/service.ts
- src/main/telegram/turn.ts
- src/main/telegram/types.ts
- src/main/terminal.ts
- src/renderer/App.tsx
- src/renderer/codex-input-state.ts
- src/renderer/types.ts
- src/renderer/workflow.ts
- src/runtime/agent-runtime.ts
- src/runtime/application-runtime.ts
- src/runtime/telegram-runtime.ts
- src/shared/types.ts
- src/styles/app.css
- tests/codex-input-state.test.ts
- tests/hooks-connectors.test.ts
- tests/island-auto-expand.test.ts
- tests/reasonix-hooks.test.ts
- tests/telegram-render.test.ts
- docs/agent-status.md
- resources/orca-status-NOTICE.txt
- src/main/hooks/codex-turn-reader.ts
- src/main/hooks/program-status.ts
- src/shared/agent-status.ts
- tests/agent-status.test.ts

## Work
- 用户明确选择界面和内部状态一起对齐 Orca；执行状态与已读提醒独立。
- 已读取协议、AGENTS.md、状态设计与团队任务 C9H4QX-u3960864-m81ae10；新请求覆盖旧三态显示约定。
- 已确认 Orca 本地参考版本 729ee62f379，MIT 许可；迁移相关算法时保留许可声明。
- 计划：建立状态与证据契约 → 接入启动身份、hook/终端来源和 UI → 重放状态转换并做渲染验证。
- 保留已有 src/runtime/application-runtime.ts、tests/web-runtime-integration.test.ts 的并行修改。

- 已接入共享显示状态与四态执行模型、精确终端身份、异步问题和子任务跟踪、OSC 7501/9999 及 hook 静默仲裁；完成状态不再因查看而删除。
- 已替换五分钟删除为三十分钟证据过期，增加 Codex rollout 当前回合结束补偿；迁移 Telegram 消费边界以避免把未知状态当完成。

- 补齐 capability probe 的主机回复、Ctrl+] 跳过异步问题、Claude 后台任务/cron 监控状态，以及同 provider 会话在不同终端的独立投影。
- 状态证据增加运行实例 authorityId 和回合 revision，避免同毫秒状态与重启后的旧 revision 误判；拒绝上一回合迟到的 Stop，重新一致的 OSC 取消接管计时。
- 已读确认保留完成事实，等待请求只由 owner 解除；进程异常退出保留失败结果，无 hook 的启动失败也可显示。
- 已记录 docs/agent-status.md 和随应用分发的 Orca MIT NOTICE；保留现有 Unix socket 和 provider 边界，没有迁入 Orca 的 SSH/tmux、多机同步或完整后台任务明细界面。
- 并行任务在本次期间提交了 v0.3.10；未将该提交记为本任务提交，也未覆盖其修改。

- 用户要求统一所有状态指示的颜色：working/monitoring 绿，done/interrupted 黄，waiting/blocked/failed 红，idle/unverifiable/unknown 灰；已读不改变状态颜色。
- 本轮计划：统一共享颜色分组与主题样式 → 调整 Island 色彩和独立未读光效 → 验证所有状态、主题、退出及已读组合。

- 共享 AGENT_STATUS_TONE 驱动终端标签、项目胶囊和 Telegram 徽标；Island 使用同一分组及四个色值，已读只解除闪烁/光效，不再将完成或失败置灰。
- 修正 morning/night 主题、is-exited 和虚线状态的覆盖优先级；保持原有通知/展开规则。读取团队任务 C8R4N7-u3960864-m81ae10，未改动 xterm 终端内容调色板或观察端外观同步。

- 用户再次调整颜色：working/monitoring 蓝，done 绿，waiting/blocked 黄，failed 红，interrupted/idle/unverifiable/unknown 灰；本轮只更新颜色映射和完成提醒光效适配，保留状态与已读语义。

- 最新配色已同步共享映射、胶囊/终端 CSS、Island 各指示和 Telegram（含历史状态别名）。补充蓝色 #3b82f6，完成绿色光效保留；文档已更新。

- 用户明确项目状态胶囊文字统一为白色；本轮只修改胶囊文字色，保留五组背景色及其他指示。

## Verification
- 第一轮类型检查通过；第一轮 4 组针对性测试 60/63 通过，3 个旧三态断言需按新中断与 hook 优先语义迁移。
- 正在补充真实事件序列回归，完整检查与渲染验证尚未执行。

- 最终 npm test -- --reporter=dot：74 个文件、523 项测试全部通过；其中新增状态/传输测试 18 项。
- npm run typecheck、npm run build、git diff --check：通过。构建只出现现有的大 bundle 提示。
- 独立 Chromium 运行实际构建的 App、xterm 与真实 Island HTML，覆盖 8 种显示状态、项目/终端/Island 一致、旧屏幕不重开完成回合、等待聚焦不清除、完成已读独立确认、相同 provider 的两终端隔离、失败退出保留状态，以及稳定等待展开和已读后收起；无 pageerror，截图已检查。
- 真实生成的 hook CLI → 独立 Unix socket → StateManager 集成验证通过，确认 terminalSessionId 随环境元数据抵达状态流。
- CodeGraph affected 未返回相关测试（索引依赖图未覆盖新增模块）；使用直接回归和全量测试验证，不将其解释为无需测试。
- 临时 HTTP 验证服务和浏览器已退出；截图位于 /tmp/sharkbay-status-render.png、/tmp/sharkbay-status-island-waiting.png。
- 未修改 /Applications/SharkBay.app，未输入、回答或中断真实用户 agent 会话。

- 本轮 npm run typecheck、npm run build、git diff --check 通过；Island/Telegram 相关 33 项测试全部通过。
- 本轮无头 Chromium 实际构建色彩矩阵：10 种状态 × day/night/morning 三套主题，项目胶囊及终端标签（叠加 exited/unread）颜色一致；unverifiable 验证灰色虚线边框。
- Island 实际 HTML 验证 10 种状态在已读/未读两种情况下圆点和文字颜色一致；既有状态、已读、等待展开/收起流程仍通过。截图已检查，临时 HTTP 服务和浏览器已退出，未操作运行中用户会话。
- 本轮保留并行新增的 tests/terminal-close-resize.test.ts，未创建提交。

- 最新五色版本：类型检查、构建、diff check 通过；Island/Telegram 33 项测试通过（迁移旧绿色执行徽标的预期）。
- 最新真实渲染矩阵通过：10 状态 × 3 主题 × 终端/项目，覆盖 exited/unread 覆盖；Island 10 状态的已读/未读圆点与文字均匹配新色值，原状态及展开/收起验证仍通过。截图已检查，临时浏览器/HTTP 服务已关闭，未替换运行中的 App。

- 胶囊白字修正：无头 Chromium 加载真实 src/styles/app.css，三套主题 × 五色背景共 15 组全部确认白色文字且背景色不变；截图已检查，git diff --check 通过。单行 CSS 调整未重复运行类型检查/全量测试，浏览器已退出。

## Notes
- .sharkbay/team-context/ 只读。
- 保留 SharkBay 本地执行投影定位，不引入 Orca 云端或协作模型。

- 精确 hook 绑定需要加载新构建，并从该构建新启动 agent；旧会话继续使用既有显式 session/PID 关联。
- 当前实现按实际已收到的 hook/OSC/inventory 证据工作；没有额外引入 agent 账号、权限、云端状态或远端同步系统。
