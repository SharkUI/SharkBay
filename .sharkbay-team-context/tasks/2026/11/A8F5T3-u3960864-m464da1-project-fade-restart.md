---
kind: sharkbay_task
taskId: A8F5T3-u3960864-m464da1
taskTag: A8F5T3
mode: quick
title: 恢复项目列表渐隐并重启验证终端色彩
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 464da1
agent: Codex GPT-6
sessionId: 01a1c5b7-1c8e-7373-b1ff-7822fa178bed
branch: feature/webui-runtime
createdAt: 2026-11-14T03:20:24Z
updatedAt: 2026-11-14T03:22:31Z
completedAt: 2026-11-14T03:22:31Z
---

## Summary
已恢复项目列表底部随栏宽变化的 28px 透明渐变，并重启本机 5185 服务加载终端色彩修复。Chrome 实际终端确认 NO_COLOR 未继承、24 位色能力和红/绿/蓝输出，页面保持连接供用户测试。

## Files
- src/styles/app.css
- dist-runtime/、dist/renderer/（构建产物）

## Work
- 承接 C4L7R9/H6B3P8/M9C4V2，查阅 C8T4R9 旧渐隐实现。使用不拦截鼠标的 28px 渐变覆盖，保留列表底部滚动空间，不使用裁切上下文菜单的 mask。
- 计划：恢复随项目栏宽度变化的渐变 → 构建/定向终端回归 → 正常重启 → 浏览器检查渐隐与终端颜色。用户已明确要求重启服务。

- SIGTERM 旧实例并观察正常清理日志后，沿用 ~/.sharkbay/webui profile 启动新服务，重新签发浏览器授权。
- 在当前工作树新建普通 shell，仅执行颜色环境检查与 ANSI 输出，不启动 Agent 或修改项目文件；保留测试终端给用户查看。

## Verification
- npm run typecheck、终端 14 项测试、npm run build、git diff --check 均退出 0。
- CUA 截图确认项目列表末尾渐隐与状态按钮分离；滚动到底后最后的 Zygnal 卡片完整可见，渐变不拦截滚动。
- 新运行实例 Chrome 终端实际输出 NO_COLOR=undefined、TERM=xterm-256color、color depth=24，RED/GREEN/BLUE 呈彩色；已有 C4L7R9 的自动颜色探测回归亦通过。
- 新版服务保持运行，浏览器已重新授权。未创建提交。

## Notes
- 不部署 103，不修改系统 shell；连接令牌不写入任务记录。
