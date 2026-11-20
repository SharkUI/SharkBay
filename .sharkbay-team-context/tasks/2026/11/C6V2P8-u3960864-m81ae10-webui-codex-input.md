---
kind: sharkbay_task
taskId: C6V2P8-u3960864-m81ae10
taskTag: C6V2P8
mode: task
title: 修复 WebUI Codex 粘贴与提交并实现底部图片附件
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1f72e-a468-7153-8b6d-4b4ed4175d0d
branch: main
createdAt: 2026-11-20T04:23:35Z
updatedAt: 2026-11-20T05:08:33Z
completedAt: 2026-11-20T05:08:33Z
---

## Summary
已修复 WebUI 中 Codex 终端的图片粘贴与底部输入栏回车提交。底部输入栏支持选择或粘贴图片、从草稿移除、随文字一起提交，以及只发送图片。

## Files
- src/renderer/App.tsx
- src/renderer/bridge/web-bridge.ts
- src/server/http-server.ts
- src/runtime/terminal-state.ts
- tests/web-runtime-integration.test.ts
- src/shared/application-api.ts
- src/styles/app.css
- src/renderer/types.ts

## Work
- 排查 WebUI Codex 终端图片粘贴和底部输入栏回车提交，调研 SharkBay 输入栏接收图片的可行性。

- 参考 W2R6K8-u3960864-m81ae10 的 30 ms 提交策略及 M7W2K9-u3960864-m81ae10 的 WebUI 输入路径。Codex CLI 0.170.0 的快速输入回车抑制窗口为 120 ms，计划通过 bracketed paste 明确区分文本和提交键。
- Web 终端的 xterm 只读取剪贴板文本。Codex TUI 支持把显式粘贴的主机图片路径附加到当前草稿，计划验证这一流程。

- WebUI Codex 底部提示在终端启用 bracketed paste 时一次写入粘贴和回车，普通终端沿用原路径。
- WebUI Codex 捕获剪贴板图片，通过当前连接与控制权校验后写入主机临时目录，再把路径以 bracketed paste 插入草稿。PNG/JPEG 上限 8 MiB。
- 底部输入栏上传/粘贴作为调研项，同一图片桥接可复用。

- 用户确认一并实现底部附件。附件属于当前 Codex 草稿，图片选择和粘贴都进入同一附件列表，可在发送前移除。发送时一次提交文字与附件，失败保留草稿。

- 底部输入栏增加选图、粘贴、移除和图片草稿反馈。提交端一次校验并暂存全部附件，再向当前 Codex PTY 写入图片、文字和回车，浏览器重试沿用请求标识。
- 使用 design-semantic-interfaces 技能检查附件入口、发送/失败状态和响应式布局，修正窄屏移除按钮被裁切及附件入口图标显示。

## Verification
- 隔离的真实 Codex CLI 0.170.0 PTY 复现纯文本 30 ms 后回车未提交。显式粘贴图片路径出现 [Image #1]，显式多行粘贴后回车进入 Working。

- 真实 Chrome + Codex CLI 0.170.0 使用隔离目录和测试剪贴板，确认 Ctrl+V 与浏览器 paste 事件都出现图片占位符，随后底部一次 Enter 提交保留图片及中文换行。
- `npm run typecheck`、`git diff --check`、`npm run verify:webui`、`npm run test:integration`（15 项）与 `npm test`（689 项）通过。集成测试覆盖跨站拒绝、终端控制权、文件类型与长度、真实 PTY 粘贴且不触发提交。
- 合并实现通过类型检查、构建、15 项集成测试和 689 项单元测试；真实 PTY 验证多附件、中文换行、仅图片发送、失效请求及并发重试去重。
- 真实 Chrome 和 Codex CLI 0.170.0 验证桌面与 390px 窄屏，覆盖文件选择、剪贴板、移除、切换标签、上传异常后的草稿保留和重试。隔离模型端点实际收到两张图片，带中文多行文字与仅图片两种场景均通过。原终端粘贴和一次回车提交流程复测通过。

## Notes
- Codex 启动中的临时编辑框仅处理文本。真实浏览器验证等待正式编辑区的模型状态栏就绪。
- macOS 的局域网 HTTP 页面可走浏览器的 Cmd+V 粘贴事件；本机安全上下文可通过 Ctrl+V 使用 Clipboard API。
- 底部附件绑定 WebUI 的当前 Codex 会话，每次最多 4 张 PNG/JPEG，单张上限 8 MiB。失败时保留文本和附件，短期重试沿用原请求标识。
- 本轮未创建 Git 提交或重启现有 WebUI 服务，浏览器验证使用独立运行时与测试模型地址。
