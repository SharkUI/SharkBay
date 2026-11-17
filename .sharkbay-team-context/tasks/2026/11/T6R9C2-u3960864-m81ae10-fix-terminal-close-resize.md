---
kind: sharkbay_task
taskId: T6R9C2-u3960864-m81ae10
taskTag: T6R9C2
mode: task
title: 修复关闭普通终端触发控制权 resize 报错
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T08:03:26Z
updatedAt: 2026-11-17T08:08:13Z
completedAt: 2026-11-17T08:08:13Z
---

## Summary
已修复关闭普通终端时 resize 与控制权清理之间的竞态：关闭开始后停止新 resize，忽略关闭中或已移除终端的迟到错误，保留活动终端及关闭请求自身的真实报错。

## Files
- src/renderer/App.tsx
- tests/terminal-close-resize.test.ts

## Work
- 已优先使用 CodeGraph 定位 resizeTerminal 与 TerminalPane，并检索团队终端关闭及 resize 记录。
- 工作区已有多项未提交修改，保留原有修改，仅修改本任务必要位置。
- 已定位 TerminalState.resize 的排队期间控制权复查与 close 清理之间的竞态；renderer 关闭前未停止 resize，迟到错误直接弹窗。计划在 renderer 关闭生命周期中取消 resize 并过滤失效回调，保留活动终端真实错误。
- 新增测试先确认旧实现三项失败；将 resize 处理移入 TerminalPane，在关闭开始时停止新请求，并忽略关闭中或已移除终端的迟到错误；活动终端 resize 与 close 请求自身的错误继续上报。
- 终端移除后回收关闭标记；不改动后端控制权判断及其他工作区已有修改。

## Verification
- 修复前回归测试 3 项失败、1 项通过，确认关闭竞态；修复后相关测试首次 19/19 通过。
- npm run typecheck 通过；git diff --check 通过。
- 最终 npx vitest run tests/terminal-close-resize.test.ts tests/terminal-state.test.ts tests/renderer-workflow.test.ts：20/20 通过，含关闭请求自身失败仍上报，以及控制权被其他连接接管时后端继续拒绝旧请求。
- 最终 npm run typecheck 与 git diff --check 均通过；未在运行中的 App 中手动复现，未打包、安装或创建提交。

## Notes
- .sharkbay/team-context/ 保持只读。
