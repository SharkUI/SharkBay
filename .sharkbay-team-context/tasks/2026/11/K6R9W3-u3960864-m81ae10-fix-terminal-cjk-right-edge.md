---
kind: sharkbay_task
taskId: K6R9W3-u3960864-m81ae10
taskTag: K6R9W3
mode: task
title: 修复终端右边缘中文显示不全
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a211b9-14bc-72f1-a453-23f9505d18a3
branch: main
createdAt: 2026-11-25T08:02:21Z
updatedAt: 2026-11-25T08:14:11Z
completedAt: 2026-11-25T08:14:11Z
commits:
  - 758c439c6c7f6355f15fd8d36dadb66924f85352
---

## Summary
修复 SharkBay 内置终端中 Chromium 中文标点压缩导致的行尾裁切。真实 Electron 和 Chrome 均通过含中文标点的满宽行回归。

## Files
- .sharkbay/tasks/K6R9W3-u3960864-m81ae10-fix-terminal-cjk-right-edge.md
- scripts/verify-shared-runtime.mjs
- src/styles/app.css
- .sharkbay/validation/shared-runtime/（验证截图）

## Work
- 用 CodeGraph 定位共享 xterm 渲染及尺寸同步路径。
- 参考 M7W2K9-u3960864-m81ae10 与 C8R4N7-u3960864-m81ae10，保留 WebUI 观察端可横向滚动和控制端决定 PTY 尺寸的行为。
- 计划用中文贴边和窗口缩放的真实终端场景定位原因，最小修复后验证类型、已有回归和实际渲染。
- xterm.js #6058 和本地 6.0.0 WidthCache 指向 Chromium 中文标点压缩导致的宽度误差。先给真实 PTY 渲染验证加入贴边复现。
- 真实 Electron 已复现。仅在共享 xterm 根节点禁用标点压缩，使宽度测量与渲染使用相同规则。
- 在现有共享运行时验证中加入末字边界断言。Chrome 从 1500px 缩窄到 700px 后使用新 PTY 列数验证，恢复原宽后再次验证。
- 用户要求提交。已核对暂存区为空，工作区差异只包含终端样式和共享运行时回归。
- 已提交 758c439，包含终端样式与共享运行时回归。

## Verification
- 修复前用 Node 24.14.1 运行 `node scripts/verify-shared-runtime.mjs`。真实 PTY 的满宽中文行文本完整进入 DOM，最后一个字越出终端网格约 109px，回归如预期失败。
- 修复后 `node scripts/verify-shared-runtime.mjs` 通过 Electron 和 Chrome 的中文贴边检查及共享 PTY 回归，人工检查 Chrome 截图中末字完整。
- `npm run build` 基线构建、修复后的 Vite 构建、`npm run typecheck`、脚本语法检查及 `git diff --check` 通过。
- `npm test` 697 项通过、11 项失败。在干净的 HEAD 副本中单独执行 browser-tab-close 和 terminal-close-resize 两组用例，复现相同的 11 项 ReferenceError 相关失败。
- 提交前暂存差异检查通过。提交后 `git show --check HEAD` 和脚本语法检查通过，已核对提交文件与干净的工作区。

## Notes
- 用户报告涉及终端右边缘，具体终端客户端、字体设置和触发条件待确认。
- 验证使用与现有原生模块 ABI 匹配的 Node 24.14.1。修复已在独立实例验证，未重启当前应用或 WebUI。
