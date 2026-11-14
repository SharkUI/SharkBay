---
kind: sharkbay_task
taskId: M7W2K9-u3960864-m81ae10
taskTag: M7W2K9
mode: task
title: 提交现有基线并适配 WebUI 移动端
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1d9cf-7921-7ed0-99b9-953d9df652d5
branch: main
createdAt: 2026-11-14T12:01:48Z
updatedAt: 2026-11-14T12:50:03Z
completedAt: 2026-11-14T12:50:03Z
commits:
  - 85fb1ce53d1c92614a86f66101dea0a51998f09e
---

## Summary
已提交基线 85fb1ce，完成 WebUI 手机/平板适配、顶部导航和稳定输入区；三横线打开全屏 Projects，使用左上角返回箭头退出，项目名下显示小号路径。改动保留工作区，类型、构建及真实浏览器验证通过。

## Files
- docs/release.md
- package.json
- src/renderer/bridge/runtime-status.tsx
- tasks/runtime-packaging/verification.md
- tests/runtime-packaging.test.ts
- src/renderer/App.tsx
- src/styles/app.css
- index.html
- src/renderer/mobile-layout.ts
- tests/build-config.test.ts
- .sharkbay/tasks/M7W2K9-u3960864-m81ae10-webui-mobile.md
- src/renderer/terminal-create-menu.tsx

## Work
- 已读取协议、AGENTS.md 与 design-semantic-interfaces 技能；团队任务 H7P4K9-u3960864-m81ae10 和 W7P4N2-u3960864-m81ae10 提供现有 WebUI 恢复及打包验证背景。
- 用户授权先提交现有全部改动；基线包含运行时依赖打包修复与侧栏恢复。
- 计划：检查并提交现有基线 → 小屏单栏、项目抽屉、全屏详情及触摸输入 → 类型、测试和真实浏览器验证。
- 保持同一项目/会话身份，复用 Web Bridge，保留桌面多栏和终端控制权规则。
- 已创建基线提交 85fb1ce；移动布局将跳过桌面列宽持久化，保持组件挂载并按会话隔离草稿。
- 已实现 Web 专属断点、项目抽屉、手机全屏详情/平板双栏、触摸菜单、文件单击打开和终端按键栏；VisualViewport 跟踪软键盘可视区域，输入框保留中文组合输入保护。
- 只读终端保留主机列数，接管后才 fit/resize；切换项目、详情、设置保留会话和草稿。
- 浏览器检查发现终端网格隐式列造成输入框和发送按钮横向裁切，改为 minmax(0, 1fr) 显式列并补充按钮完整可见断言。
- 全量测试发现基线提交新增 runtime/node_modules 映射未同步旧 build-config 断言；最小补齐预期映射。
- 修复真实触摸测试发现的任务菜单按钮被卡片覆盖，并确保 Escape 先关闭菜单再关闭项目抽屉。
- 已按 React 技能复核 Hook 清理、受控输入、焦点/惰性区域、触摸目标与组件身份；未引入额外数据或权限模型。
- 根据真实设置页截图将手机配色预览置于可滚动列表上方、Agent 列表改为横向选择，并补齐移动重排区域的深色对比度。
- 完成最终截图检查并关闭隔离测试实例；未更改用户运行中的主机、未发布、未再次提交。
- 用户反馈顶部交互/图标粗糙，以及窄屏底部输入框消失；重新打开本任务，先查 Apple HIG、复现输入区，再改进导航层级与紧凑工具栏并验证。
- Apple HIG 参考：https://developer.apple.com/design/human-interface-guidelines/toolbars 、icons 、buttons；采用前侧导航/居中标题/后侧内容操作、标准符号、低频操作收纳与稳定输入区。
- 真实浏览器复现：手机查看未接管终端时 `.prompt-input-bar` 为 display:none，dock 高度 0；尺寸从 320×240 至 1024×600 的可控终端没有同样消失，因此修复状态隐藏而非猜测尺寸。
- 移除输入区的禁用隐藏样式，未接管时在输入旁显示接管动作，断线保留草稿并显示重连占位；短视口限制多行输入高度，终端内容承担剩余空间。
- 顶部改用一致线性符号、44px 点击区、居中 17px 项目名、前侧返回、后侧详情检查器；紧凑布局的启动入口收纳为带名称的 + 菜单，替换字符 x 与重复路径栏。
- 菜单使用语义按钮、显式展开状态，验证 Enter/Escape 和焦点返回；复查发现默认底部通知会覆盖输入框，将紧凑 Web 通知移至顶部。
- 输入区仅对终端标签显示；编辑器/预览保持原有行为，终端的只读与断线状态使用同一稳定输入区。复查截图、关闭全部隔离验证实例，未产生新提交。
- 用户追加：左上角改为三横线，Projects 改为全屏选择页，居中项目名下显示小号项目路径。重新打开本任务，最小修改 App/CSS 后验证全屏边界、切换路径及窄屏截断。
- 工作区新增的 tests/browser-tab-close.test.ts 属于其他工作，保持不动。
- 全屏 Projects 跟随可视区域并保留安全边距、关闭与焦点返回；移除不再使用的遮罩，顶部路径使用 10px 单行省略并通过 title 保留全文，随项目选择更新。
- 用户截图反馈：全屏 Projects 退出应使用左上角返回箭头。将原标题后的关闭叉号替换为标题前的返回按钮，保持关闭及焦点恢复行为。

## Verification
- 基线 `git diff --check`、`npm run typecheck`、`npx vitest run tests/runtime-packaging.test.ts` 通过。
- `npm run build`、最终 `npm run typecheck` 与 `npx vite build` 通过。
- `codegraph affected` 未关联到现有测试，改用真实运行时端到端验证。
- `node scripts/verify-webui-runtime.mjs` 通过编译 WebUI 的授权、WebSocket、真实 PTY 与退出清理验证。
- `npm test` 通过：72 个文件、468 项测试。
- 最终 Chrome 移动仿真脚本 `/tmp/sharkbay-mobile-verify.mjs` 通过：375/390/430/844/1024/1179/1180/1440px、只读不改变 PTY、接管适配手机、真实命令输出、中文组合输入保护、触摸按键、WebSocket 重连草稿、桌面列宽保留、任务详情与菜单、文件单击编辑、项目/设置往返、短视口及 VisualViewport 事件模拟、横屏/平板布局；页面无 JS 异常。
- 通过真实 Settings → Appearance → Night 切换主题，检查颜色列表、Agent CLIs、任务菜单和深色终端截图。
- `/tmp/sharkbay-mobile-desktop.mjs`（原 shared-runtime 验证脚本的临时副本，仅更改依赖/截图路径）通过真实 Electron 与 Chrome：桌面创建终端、浏览器观察/接管/刷新、同一 PTY、桌面退出后终端存活、停止清理。
- 最终 `git diff --check` 通过；截图在 `/tmp/sharkbay-mobile-*.png` 和 `/tmp/sharkbay-mobile-desktop-regression/`，已人工检查。
- 未连接实体 iOS/Android 设备；软键盘用短视口和 VisualViewport 属性/事件模拟验证，实机行为仍需确认。
- 本轮首次 `npm run typecheck` 与 Vite 构建通过；复现脚本为 `/tmp/sharkbay-mobile-reproduce.mjs`，新版回归脚本为 `/tmp/sharkbay-mobile-refine-verify.mjs`。
- 本轮最终类型检查、Vite 构建、19 项相关测试（renderer-workflow/terminal-state/web-runtime-integration）通过。
- 新版 Chrome 回归通过：320–1440px、未接管/断线输入框始终可见且禁用、接管后真实 PTY 输入、菜单键盘打开/Escape 关闭、从菜单创建会话、草稿保留、320×240 多行输入与键盘可视区模拟、详情返回和触摸菜单；页面无 JS 异常。
- 本轮真实 Electron/Chrome 回归通过：共享同一 PTY、观察/接管/刷新、桌面退出后继续输入与停止清理；脚本改用接管按钮的 aria-label 查找以适配新显示文案。
- 最终类型检查、Vite 构建、Chrome 新版回归和 `git diff --check` 均通过；最终 390×844 输入框实测 y=783、height=44、bottom=827，完整位于可视区域内。
- 已人工检查浅/深色终端、未接管输入区、详情返回和新增会话菜单截图；实机软键盘限制同上。
- 最新 `npm run typecheck`、Vite 构建和 `git diff --check` 通过；`/tmp/sharkbay-mobile-projects-verify.mjs` 验证 320/390/844/1024px 的 Projects 精确覆盖视口、关闭/选择、10px 路径位置和全文，以及前述终端/键盘/草稿回归，均通过。
- 已检查 `/tmp/sharkbay-mobile-fullscreen-projects.png` 与最新终端截图；本轮未产生提交，隔离测试实例已关闭。
- 本轮类型检查、Vite 构建和 `git diff --check` 通过；`/tmp/sharkbay-mobile-projects-back-verify.mjs` 验证 320/390/844/1024px 全屏、返回箭头在标题前、无关闭叉号、返回后的焦点和同一终端保持，均通过。已检查截图 `/tmp/sharkbay-mobile-projects-back.png`，未提交。

## Notes
- .sharkbay/team-context/ 只读。移动适配结果暂留工作区供用户检查，不默认再次提交。
