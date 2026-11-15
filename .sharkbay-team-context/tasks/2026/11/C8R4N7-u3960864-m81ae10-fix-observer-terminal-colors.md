---
kind: sharkbay_task
taskId: C8R4N7-u3960864-m81ae10
taskTag: C8R4N7
mode: task
title: 修复未接管终端的配色异常
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1dee0-eb95-7c33-acb0-71cdaec38289
branch: main
createdAt: 2026-11-15T11:04:37Z
updatedAt: 2026-11-15T11:21:17Z
completedAt: 2026-11-15T11:21:17Z
commits:
  - 62928850bd0e414da9b2cc404f758ddeb880fd7b
---

## Summary
已修复观察端初始外观闭包与快照写队列竞态，通过真实双端及相关回归验证。提交 62928850bd0e414da9b2cc404f758ddeb880fd7b 已推送 origin/main；原有启动页 CSS 改动保留。

## Files
- src/runtime/terminal-state.ts
- src/renderer/App.tsx
- tests/terminal-state.test.ts
- scripts/verify-shared-runtime.mjs
- .sharkbay/validation/shared-runtime/（隔离验证截图）
- .sharkbay/tasks/C8R4N7-u3960864-m81ae10-fix-observer-terminal-colors.md

## Work
- 已读取协议及 AGENTS.md，CodeGraph 定位 TerminalState 与 createXTerm。
- 已检索团队上下文；关联 M7W2K9-u3960864-m81ae10 的观察端尺寸与接管规则，保留现有规则。
- 计划：定位主题/快照/接管差异 → 增加可复现的回归检查并最小修复 → 运行相关测试与类型检查。
- 工作区已有 src/styles/app.css 修改，保持用户改动。
- 最小复现：先 write 黄色背景，再立即 reset/write，旧输出稍后解析导致新内容继承黄底；reset 也不会清除未结束的 ANSI 解析状态。
- 快照加 CAN + RIS，取消残留指令并在 xterm 写队列内重置；移除 renderer 的即时 reset，保留尺寸与控制权规则。
- 新增三种残留状态回归：黄底、未结束的 CSI、未结束的 OSC；覆盖连续快照及后续增量颜色。
- 新增全屏 TUI 备用屏幕回归，验证接管与尺寸变化后的 RGB 背景和后续默认颜色。
- 已完成隔离 Electron/Chrome 的默认浅色、Morning 深色同步检查；两端互相接管、快照前排队黄底输出均保持颜色一致。未改动用户运行的实例，未生成提交。
- 用户后续截图显示实际 Codex 会话在观察 App 内仍为浅底；上一轮普通 ANSI 样例未覆盖实际 Codex 动态颜色，继续调查，不将此前通过的样例视为问题已完全修复。
- 进一步复现准确根因：两端先打开再新建终端，观察端同步回调捕获初始 day/null 设置；实测两端 UI 都为 morning，但观察端终端仍为 #f7f1e4/12px，控制端为 #101719/14px。问题不依赖 Codex 动态调色。
- attachTerminalSession 改为从最新外观 ref 创建 xterm，覆盖主题、配色、字体、字号和行高，保留现有长生命周期订阅。
- 将“两端设置加载后新建终端”的真实渲染颜色/字号断言加入现有 shared-runtime 验证脚本，并修正该流程所需的接管按钮查找和刷新新文档等待。
- 本轮实际确认与动态调色无关，准确根因是初始化闭包；已检查最终浏览器截图，保留用户原有 CSS 改动，所有隔离实例清理完成。
- 用户授权 commit & push；准备只提交本任务四个源码/验证文件，排除原有 src/styles/app.css 启动页改动，推送 origin/main。
- 已提交 62928850bd0e414da9b2cc404f758ddeb880fd7b（fix: preserve terminal appearance across observers），四个文件；origin/main 推送成功。

## Verification
- 先完成最小复现后执行以下验证。
- 修复前三个新增回归均失败，修复后相关 22 项测试通过（terminal-state/web-runtime-integration/renderer-workflow）。
- npm run typecheck、npm run build、git diff --check 通过。
- CodeGraph affected 未关联现有测试，按终端同步链路选择上述测试及实际双端验证。
- 最终 npx vitest run tests/terminal-state.test.ts tests/web-runtime-integration.test.ts tests/renderer-workflow.test.ts：23 项通过；git diff --check 通过。
- /tmp/sharkbay-observer-colors-verify.mjs：真实同一 PTY、双向接管、两端排队黄底后快照恢复、默认/ANSI/RGB 颜色逐单元格比较、浏览器刷新、桌面退出后 PTY 存活和显式停止清理通过。
- 已检查 /tmp/sharkbay-observer-colors/browser.png，深色背景正常且仅指定文字区域使用黄底；Electron 使用真实终端单元格检查，原生截图曾超时，最终脚本不依赖原生截图。
- 验证脚本初次返回终端对象触发 CDP 序列化错误，改为 void；刷新检查增加新文档标志以消除旧文档误判。最终完整运行通过，隔离实例均已清理。
- 本轮 /tmp/sharkbay-late-attach-colors.mjs 与持久化 scripts/verify-shared-runtime.mjs 在修改前均准确失败：观察端浅底/12px，而期望深底/14px。
- 本轮 npm run build、npm run typecheck、23 项相关测试及 git diff --check 通过；继续真实双端回归。
- 最终 node scripts/verify-shared-runtime.mjs 完整通过：两端先加载设置再创建终端，真实渲染背景/前景/14px 字号一致，接管、刷新、同一 PTY 与退出清理通过；浏览器截图已人工检查，原生截图超时使用现有可选回退。
- /tmp/sharkbay-late-attach-colors.mjs 通过 App 和 Web 分别新建、另一端自动同步、双向接管验证；两端均为 #101719。
- /tmp/sharkbay-custom-attach-colors.mjs 通过两种创建方向，Aura 调色板 #15141b、Menlo 15px 和 1.4 行高均一致，覆盖初始 null 配置闭包导致自定义设置丢失的路径。
- 最终 git diff --check 通过；未操作用户运行中的 App/runtime 或创建提交。源码和 dist 已更新，现有前端需重新加载以重建错误的本地 xterm。
- 提交前 git diff --cached --check 通过，暂存集合仅本任务四个文件；git fetch 后 main/origin 为 0/0，git push origin main 成功。

## Notes
- .sharkbay/team-context/ 保持只读；本轮用户已授权提交和推送。
