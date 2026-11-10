---
kind: sharkbay_task
taskId: C8T4R9-u3960864-m81ae10
taskTag: C8T4R9
mode: task
title: 左侧栏咖啡杯防休眠开关
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a18b5b-5a33-7260-893d-1df9d521d78a
branch: main
createdAt: 2026-10-30T05:52:37Z
updatedAt: 2026-11-10T06:40:48Z
completedAt: 2026-11-10T06:40:48Z
---

## Summary
已在左侧栏底部增加固定图标状态栏和两态咖啡杯，复用持久化设置，仅在 SharkBay agent session 正在 working 时启动 macOS caffeinate，停止工作、关闭开关或退出应用时释放。界面保持纯图标，无新增辅助标题或说明；按用户反馈收紧底栏、移除分割线；最新调整将咖啡杯放大至 16.8px、按钮外框放大至 26.4px 并与项目卡片左边缘对齐，项目列表底部加入渐隐。

## Files
- .sharkbay/tasks/C8T4R9-u3960864-m81ae10-sidebar-caffeinate-tray.md
- src/renderer/App.tsx
- src/styles/app.css
- electron/ipc.ts
- src/main/caffeinate.ts
- tests/caffeinate.test.ts

## Work
- 已读取协议、根目录 AGENTS.md、界面设计技能及团队上下文。
- 通过 CodeGraph 定位已有防休眠配置和侧栏；复用现有持久化设置，底栏仅使用图标及按下状态，不增加辅助标题和描述。
- 计划：接入底栏开关与进程生命周期；验证类型、生命周期测试和真实渲染。

- 已接入侧栏底部固定图标栏和两态咖啡杯；复用设置持久化，增加可访问名称和键盘焦点。
- 使用 macOS caffeinate -di -w 绑定主进程；工作结束、开关关闭及应用退出时清理，避免重复进程。

- 完成原生防休眠断言检查与 Electron 真实渲染检查；关闭独立测试实例，未创建提交。

- 根据用户反馈继续收紧底栏：咖啡杯由 18px 调整为 14px、按钮由 28px 调整为 22px，底栏垂直内边距由 6px 调整为 2px，并移除分割线。

- 继续按截图反馈调整：仅将咖啡杯图标从 14px 放大 20% 至 16.8px，保持按钮与底栏尺寸；项目列表底部增加 28px 渐隐，并保留末项可完整滚入的空间。采用不拦截鼠标的渐变覆盖层，避免 mask 裁切列表内的右键菜单与弹窗。

- 用户补充：按钮外框同步放大 20%，从 22px 调整为 26.4px；移除底栏 10px 水平内边距，使按钮外框左边缘与项目卡片对齐。

## Verification
- 初次定向测试发现测试断言 API 与现有 Vitest 版本不兼容，已修正；类型检查同时发现 afterEach 返回值问题，已修正。
- `npm test -- tests/caffeinate.test.ts tests/config-migration.test.ts tests/ipc-channels.test.ts tests/ipc-protocol-install.test.ts`：4 个文件、12 项测试全部通过。
- `npm run typecheck`、`npm run build`、`git diff --check` 均通过。
- `codegraph affected src/renderer/App.tsx src/styles/app.css electron/ipc.ts src/main/caffeinate.ts tests/caffeinate.test.ts`：定位相关 caffeinate 测试。
- 原生 macOS smoke check：真实启动 caffeinate，使用 ps 和 pmset 确认父进程绑定、单实例和电源断言；停用后确认子进程退出。
- 独立配置与用户目录的 Electron 测试实例：检查浅色与深色主题的开关渲染、键盘焦点及 Enter 切换、与 General 设置同步、重新加载后保持开启状态。
- 未通过真实 agent 执行回合重测现有 working 聚合；该聚合保持原实现并已人工确认覆盖所有项目的 agent tabs。

- 尺寸调整后在独立 Electron 实例确认实际渲染：14px 咖啡杯、22px 按钮、26px 底栏，无分割线；`git diff --check` 通过。本次仅调整尺寸和样式，未重复运行行为测试。

- 2026-11-10：`npm run typecheck`、`git diff --check` 通过；使用独立 Electron 配置和 14 个临时项目检查真实渐隐效果，确认滚到末尾最后一项完整可见、咖啡杯放大且底栏无分割线。仅样式改动，未新增测试；检查后关闭预览和 Vite，未创建提交。

- 2026-11-10 外框及对齐调整：独立 Electron 真实渲染确认按钮外框扩大 20% 且与项目卡片左边缘对齐；`git diff --check` 通过。仅三处 CSS 值变更，未重复运行逻辑测试；预览已关闭，无提交。

## Notes
- 相关先前任务：C7F2N9-u3960864-m81ae10，已有 working 状态聚合与 Electron powerSaveBlocker。
- 将“session 在运行”解释为 agent 正在 working；空闲或等待用户时释放防休眠。
- 保留用户已有 AGENTS.md 修改，不纳入本任务。
