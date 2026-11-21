---
kind: sharkbay_task
taskId: M9C4V2-u3960864-m464da1
taskTag: M9C4V2
mode: quick
title: 添加左下角云电脑图标和占位菜单
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-14T03:17:37Z
updatedAt: 2026-11-14T03:19:13Z
completedAt: 2026-11-14T03:19:13Z
---

## Summary
已将左下角连接指示改为电脑图标按钮，复用旧咖啡杯原生菜单交互，预留 Turn On/Off、Auto、View Desktop 三项。已连接为绿色亮屏/勾选，未连接为灰色斜线；菜单项禁用且未接入电源或远程桌面能力。

## Files
- src/renderer/bridge/runtime-status.tsx
- src/styles/app.css
- dist/renderer/（构建产物）

## Work
- 承接 H6B3P8；复用 C8T4R9 的咖啡杯原生 select 交互和尺寸，CodeGraph 定位 RuntimeStatus；团队镜像只读。
- 设计：已连接为绿屏亮起的电脑，未连接为灰色斜线图标；当前只有服务连接信号，不将断线描述成物理关机。菜单 Turn On/Off、Auto、View Desktop 仅禁用占位，无宿主控制/配置写入。
- 计划：最小 UI 改动 → 类型/构建检查 → Chrome 图标/菜单实际回验；保留现有主机及 Agent 会话。

- 保持旧 26.4px 按钮尺寸与键盘焦点样式；连接状态仍可播报，完整授权/断线说明保留在提示中。不增加模拟电源状态或持久化设置。

## Verification
- npm run typecheck、npx vite build、git diff --check 均退出 0。
- CUA 刷新之前的预览标签，确认 Cloud computer: Online 图标按钮；点击后原生菜单实际显示禁用的 Turn Off、Auto、View Desktop 三项，截图确认左下角定位。
- 离线灰色斜线分支经源码核对，未主动断开用户运行服务做离线视觉验收。保留现有 Agent 进程，不创建提交。

## Notes
- 云电脑真实电源状态、开关机策略及远程桌面接入留待后续开发。
