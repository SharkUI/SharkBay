---
kind: sharkbay_task
taskId: H6B3P8-u3960864-m464da1
taskTag: H6B3P8
mode: quick
title: 移除品牌条并恢复左下角连接状态栏
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-14T03:10:31Z
updatedAt: 2026-11-14T03:12:03Z
completedAt: 2026-11-14T03:12:03Z
---

## Summary
已移除顶部品牌条，将 Online/连接状态固定到左下角并为项目列表保留底部空间；移除红绿灯顶部预留，PROJECTS 靠左，新增与设置按钮靠右紧排。Chrome 新标签页已加载新版，原用户会话保持运行。

## Files
- src/renderer/App.tsx
- src/renderer/bridge/runtime-status.tsx
- src/styles/app.css
- dist/renderer/（构建产物）

## Work
- 已阅读界面设计技能，CodeGraph 定位 DashboardView/RuntimeStatus，查阅 C8T4R9-u3960864-m81ae10 的旧左下角状态栏尺寸与定位；团队镜像只读。
- 设计主张：项目导航在顶部，宿主状态在固定左下角。连接状态位置不随列表滚动或离线变化；保留断线保护及状态播报，不恢复 macOS caffeinate。
- 计划：状态栏改为左下角轻量圆点与短状态（完整断线说明保留可访问名称/提示）；项目标题靠左、两动作靠右紧排、去掉旧红绿灯预留；类型/构建及实际浏览器检查。

- 状态栏保留在 workspace 外，断线 inert 保护不会隐藏状态播报；固定定位避免跟随项目列表滚动，短状态配原有完整授权/断线说明。
- 已检查 React 订阅清理、无新增重复状态、按钮名称及焦点语义；仅改变呈现与排列，不重启主机。

## Verification
- npm run typecheck、npx vite build、git diff --check 均退出 0；无低价值实现镜像测试。
- CUA Chrome 新标签真实截图确认无品牌条，左上 PROJECTS 与紧排的 +/设置按钮，上边距与工作台面板对齐；左下绿点 Online 位于列表之外，未遮挡末项。
- 新标签成功恢复现有终端为观察模式，未接管或注入输入；原用户标签保持打开。未切断连接验证离线视觉状态，原有订阅与 inert 行为保持。无提交。

## Notes
- 保留当前运行实例和用户 Agent 会话；本轮只构建浏览器资源，刷新不重启主机。
