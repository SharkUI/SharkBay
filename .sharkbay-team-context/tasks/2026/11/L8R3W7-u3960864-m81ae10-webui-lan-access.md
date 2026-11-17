---
kind: sharkbay_task
taskId: L8R3W7-u3960864-m81ae10
taskTag: L8R3W7
mode: task
title: 支持 WebUI 局域网访问
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T03:44:56Z
updatedAt: 2026-11-17T03:52:05Z
completedAt: 2026-11-17T03:52:05Z
---

## Summary
已支持 WebUI 在默认 17777 端口通过局域网 IPv4 访问，保留一次性连接授权与严格 Host/Origin 校验，并修复 HTTP 下请求 ID 和复制操作兼容性。全量 480 项测试及真实 Chrome 局域网地址操作验证通过；未创建提交。

## Files
- README.md
- src/server/http-server.ts
- src/server/main.ts
- src/renderer/bridge/web-bridge.ts
- src/renderer/clipboard.ts
- src/renderer/App.tsx
- tests/web-runtime-integration.test.ts
- .sharkbay/tasks/L8R3W7-u3960864-m81ae10-webui-lan-access.md

## Work
- 已读取协议与根目录 AGENTS.md，并通过 CodeGraph 定位 Web 服务、浏览器 bridge 和授权实现。
- 已检索团队上下文，参考 P7W4K2-u3960864-m81ae10 固定端口任务；保留 17777 默认值和已有端口覆盖能力。
- 计划：按本机实际接收地址校验 Host、支持同源局域网请求及 WebSocket、处理 HTTP 局域网浏览器 API 限制，并运行回归验证。
- 新增真实局域网网卡 HTTP/WS 和无 randomUUID 的 bridge 回归用例，修改前确认 3 项失败：LAN 连接被拒绝、HTTP 浏览器命令无法生成请求 ID。
- 将服务监听改为所有 IPv4 接口，以 socket 接收地址严格校验 Host，以校验后的访问地址检查 Origin 与生成 CSP；主机终端输出共享同一一次性授权的 LAN 链接。
- 应用 design-semantic-interfaces 技能：用户仍操作同一项目和终端，连接、重连与复制入口不随访问方式改变，不增加界面模式或控件；仅为 HTTP 下复制路径/URL 增加兼容实现与失败反馈。
- 浏览器请求 ID 改用 getRandomValues，不依赖安全上下文的 randomUUID；复制操作优先使用 Clipboard API，HTTP 下回退到临时文本选择复制，完成后恢复焦点。
- README 记录局域网授权方式、共享 grant 的一次性语义及防火墙前提；未实现项目测试 URL 转换、域名或代理。
- 按 vercel:react-best-practices 检查修改组件：复制逻辑保留在事件回调，无新增 Hook/订阅或依赖，错误反馈通过父组件回调沿用既有 Toast；临时 DOM 在 finally 中清理。
- 真实 Chrome 验证结束，停止本任务的隔离 Runtime，清理临时项目、配置、终端和目录；保留用户现有运行实例。

## Verification
- 回归复现：`npx vitest run tests/web-runtime-integration.test.ts` 修改前 7 项通过、3 项预期失败。
- 网络与 bridge 修改后，上述 10 项全部通过（包含本机真实局域网网卡连接、终端输入/重授权）；初次类型检查通过。
- 复制修改的初次类型检查发现子组件不能直接调用 setToast，改为父组件传入 onError 后，`npm run typecheck` 通过。
- `npm run build`、最终 `npx vite build` 和 `npm run build:runtime` 均通过；`git diff --check` 通过。
- `npm test`：73 个测试文件、480 项测试全部通过；最后规范化 Host 的默认端口表示后，重跑 web-runtime-integration 与 web-runtime-security 共 18 项全部通过。
- 真实 Chrome 使用本机局域网 IPv4 访问编译后的 WebUI：一次性授权后显示已连接，创建真实终端并执行 printf 得到 lan-browser-ok，打开 Files，Copy Path 后粘贴得到正确绝对路径，输入框可清空并继续使用；截图检查页面和终端渲染正常。

## Notes
- 保留上个任务的 electron/runtime-client.ts、src/server/main.ts 端口改动及已有 src/styles/app.css 修改。
- 团队上下文只读；不重启用户现有 Runtime 或停止其终端。
- 仅支持直接访问本机 IPv4 与实际服务端口，域名 Host 和跨 Origin 请求仍被拒绝；既有 Runtime 需使用更新后的程序重新启动才生效。
- 浏览器验证从本机访问局域网网卡地址，未使用第二台实体设备；其他设备仍取决于主机防火墙与局域网连通性。
