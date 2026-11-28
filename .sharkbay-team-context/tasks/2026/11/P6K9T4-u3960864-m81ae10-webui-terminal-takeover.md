---
kind: sharkbay_task
taskId: P6K9T4-u3960864-m81ae10
taskTag: P6K9T4
mode: task
title: 修复 WebUI 终端接管闪烁与输入中断
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a22102-014e-7530-bb46-e1f1d32734a5
branch: main
createdAt: 2026-11-28T07:19:11Z
updatedAt: 2026-11-28T07:24:57Z
completedAt: 2026-11-28T07:24:57Z
---

## Summary

修复 WebUI 终端控制权被迟到 HTTP 响应覆盖导致的接管按钮闪烁和输入中断。观察和重连时可继续编辑草稿，控件保持稳定位置，恢复控制后可发送原草稿。

## Files
- src/renderer/bridge/web-bridge.ts
- src/renderer/App.tsx
- tests/web-runtime-integration.test.ts
- src/styles/app.css
- scripts/verify-shared-runtime.mjs
- .sharkbay/validation/shared-runtime/browser.png（验证截图）
- .sharkbay/validation/shared-runtime/electron.png（验证截图）

## Work
- 通过 CodeGraph 和定向源码阅读定位 Web 终端输入、接管及 Runtime 事件链。
- 已查团队任务 W8N4R2-u3960864-m464da1、M7W2K9-u3960864-m81ae10、T6R9C2-u3960864-m81ae10 和 C8R4N7-u3960864-m81ae10，沿用单控制端、观察端尺寸和同一 PTY 恢复规则。
- 计划先用延迟 HTTP 响应复现控制权倒退，再让 WebSocket 成为 Web 控制权的唯一来源，并让草稿编辑与发送权限独立，最后检查真实 Chrome 的焦点、草稿和控制权过渡。

- 真实 Runtime 复现双向竞态：迟到的列表会撤回已确认接管，迟到的接管 HTTP 回包会误恢复已转出的控制权。

- Web 控制权由当前连接的有序 WebSocket 事件更新；首次附着确认前等待，避免自动恢复时短暂闪出接管按钮。
- 底部草稿编辑与发送能力独立；接管和发送共用同一按钮位置，接管时保留焦点和光标并防止重复点击。

## Verification
- 修复前 loopback 和 LAN HTTP 均复现，两项回归预期失败。

- npm run typecheck、git diff --check、npm test（708 项）、npm run test:integration（23 项）通过。
- npm run verify:shared 通过构建和真实 Electron/Chrome；补强验证后直接运行 node scripts/verify-shared-runtime.mjs 再次通过。Chrome 验证接管时动作宽度、中文草稿、焦点与光标保持，断线时可继续输入，重连后草稿送达同一 PTY。
- 已检查 Chrome 渲染截图。未创建提交或部署。

## Notes
- Web 控制权属于当前 Runtime 连接。旁观和断线时仍可编辑本地草稿，只有控制端可向 PTY 发送。
