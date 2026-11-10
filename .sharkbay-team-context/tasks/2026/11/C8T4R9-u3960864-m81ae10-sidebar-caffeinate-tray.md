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
updatedAt: 2026-11-10T09:38:10Z
completedAt: 2026-11-10T09:38:10Z
commits:
  - 62ce562587978efc98b5db790a2c53b84a4fe229
---

## Summary
已在左侧栏底部增加咖啡杯下拉菜单和项目列表渐隐。最终支持关闭、启用、自动启用三种持久化模式，咖啡杯按下态反映当前防休眠是否生效；自动模式由全部项目任一 tab 的 working 状态驱动，保留已有尺寸及左侧对齐。

## Files
- .sharkbay/tasks/C8T4R9-u3960864-m81ae10-sidebar-caffeinate-tray.md
- src/renderer/App.tsx
- src/styles/app.css
- electron/ipc.ts
- src/main/caffeinate.ts
- tests/caffeinate.test.ts
- src/shared/caffeinate.ts
- src/shared/types.ts
- src/shared/ipc-channels.ts
- src/renderer/types.ts
- src/main/config.ts
- electron/preload.mts
- tests/config-migration.test.ts
- tests/ipc-channels.test.ts
- tests/caffeinate-mode.test.ts

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

- 用户要求 commit & push；准备仅提交本任务改动，保留其他并行任务的文件及 App.tsx 中 Codex 输入状态相关修改。

- 已创建提交 62ce562587978efc98b5db790a2c53b84a4fe229 并推送 origin/main；其他并行任务的修改保留在工作区。

- 最新用户规则：咖啡杯改为自动状态指示，任一 tab working 即按下并防休眠，全部非 working 即松开并释放；移除手动切换与 General 中的旧开关，避免持久化配置阻止自动行为。复用所有项目现有 tab 工作状态汇总，保持并行 Codex 状态修改。
- 验证计划：检查多 tab 工作汇总、两态真实渲染和自动 IPC 激活/释放；运行类型检查与现有进程生命周期测试。

- 用户最新更正：保留手动控制，改为咖啡杯下拉菜单选择关闭 / 启用 / 自动启用；按下态表示实际生效，菜单选中态表示模式。新增配置默认自动，旧布尔设置 false→off、true→auto，保存模式并保持 tab 汇总。计划验证三模式真值表、配置迁移与真实菜单。

- 三模式实现使用原生 select 菜单，保持纯图标底栏和系统键盘行为；配置及 preload/IPC 同步升级到 caffeinateMode，移除旧布尔 API，迁移读取兼容旧设置。

- 用户截图中的黑框来自新增 focus-within 外扩 outline；改为仅 select:focus-visible 时显示，并使用内侧偏移避免左侧边缘裁切。验证鼠标选择菜单后无残留外框、键盘聚焦仍有提示。

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

- 提交前从 Git index 导出独立快照（排除其他未暂存修改），`npm run typecheck` 和 4 个文件共 12 项定向测试通过；`git diff --cached --check` 通过。

- `git push origin main` 成功；`git rev-list --left-right --count HEAD...origin/main` 为 0/0。

- 自动状态最终检查：`npm run typecheck`、`git diff --check` 通过；caffeinate、codex-input-state、renderer-workflow 三个测试文件共 26 项通过。
- 从当前 TypeScript AST 提取实际 tab 汇总与 caffeinate effect 执行断言：多项目及非活动 tab 的 working 生效，approval/stopped 不阻止其他 working，无 tab 为 false，IPC 自动发送 false→true→false，renderer 不再读取旧配置开关。
- 从实际组件源码生成临时 Electron fixture，检查非活动→working→停止时咖啡杯外观及可访问状态同步；未运行真实 agent 执行回合。预览及服务已关闭，本轮未提交。

- 三模式最终验证：caffeinate-mode、caffeinate、config-migration、ipc-channels、ipc-protocol-install 共 5 个测试文件、23 项测试通过；`npm run typecheck`、`npm run build`、`git diff --check` 通过。
- 独立配置的真实 Electron 窗口：Auto 无 working 保持松开；点击咖啡杯显示 Off/On/Auto 原生菜单；选择 On 后无工作 tab 仍按下，确认配置保存和原生 caffeinate 单进程启动，重新加载仍为 On；键盘选 Off 后松开并确认进程释放。自动模式有/无 working 的真值表通过单元测试，既有多项目工作汇总保持不变。
- CodeGraph affected 未返回相关测试，因此手动执行上述相关测试。预览及 Vite 已停止；本轮未提交。

- 焦点框修复：独立 Electron 中鼠标打开菜单并选 Auto 后确认无残留黑框；Tab / Shift+Tab 聚焦仍有内侧提示且不被左边缘裁切。`git diff --check` 通过；本轮仅调整两个 CSS 规则值，未重复行为测试；预览和服务已停止。

## Notes
- 相关先前任务：C7F2N9-u3960864-m81ae10，已有 working 状态聚合与 Electron powerSaveBlocker。
- 将“session 在运行”解释为 agent 正在 working；空闲或等待用户时释放防休眠。
- 保留用户已有 AGENTS.md 修改，不纳入本任务。
