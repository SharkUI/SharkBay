---
kind: sharkbay_task
taskId: K7V4M2-u3960864-m81ae10
taskTag: K7V4M2
mode: task
title: 对齐 WebUI 和桌面 App 的输入栏附件
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1f72e-a468-7153-8b6d-4b4ed4175d0d
branch: main
createdAt: 2026-11-20T05:33:05Z
updatedAt: 2026-11-20T05:52:47Z
completedAt: 2026-11-20T05:52:47Z
---

## Summary
桌面 App 与 WebUI 的 Codex 输入栏现在共用支持选取和粘贴的加号附件入口，可同时发送图片、普通文件和提示。PNG/JPEG 作为视觉附件，普通文件保存在主机的私有临时目录并通过路径提供给 Codex。PNG/JPEG 单张上限 8 MiB，每次附件总量上限 64 MiB。

## Files
- src/renderer/App.tsx
- src/renderer/bridge/web-bridge.ts
- src/styles/app.css
- src/shared/application-api.ts
- src/shared/ipc-channels.ts
- src/server/http-server.ts
- src/runtime/control-server.ts
- electron/ipc.ts
- electron/preload.mts
- tests/web-runtime-integration.test.ts
- tests/ipc-channels.test.ts

## Work
- 以 C6V2P8-u3960864-m81ae10 的 WebUI Codex 图片附件为基线，将主题一致的加号、选择或粘贴多个文件、独立会话草稿及发送流程对齐到桌面 App。
- 普通文件放在主机的私有临时目录并随提示提供路径。PNG/JPEG 继续以 Codex 视觉附件发送。复用已有每次 4 个、单个 8 MiB 的草稿限制。
- 桌面 App 由主进程通过回环 HTTP 发送与浏览器同格式的文件内容，凭本地控制连接获得仅用于附件上传的凭据并沿用终端控制权。

- 两端复用文件选择、paste 事件和附件列表，按钮沿用输入栏配色。新增回环附件通道把桌面端上传与同一控制连接绑定，复用 WebUI 的文件分类、存储、终端写入及重复请求处理。

- 根据用户反馈把视觉附件与普通文件的大小限制拆开。PNG/JPEG 每张仍限 8 MiB，全部附件合计限 64 MiB，普通文件可使用整个上传额度。

- 前端草稿、桌面/浏览器请求和服务端共用同一附件分类和大小规则。直接粘贴到 Codex 终端的图片仍按 8 MiB 校验。

## Verification
- `npm run typecheck`、`npm run build`、`git diff --check`、`npm test`（689 项）、`npm run test:integration`（15 项）及编译 WebUI smoke 通过。测试覆盖同一终端的两端上传、混合附件、并发重试去重、普通文件读回、旁观模式和桌面凭据的回环及断开限制。
- 使用真实 Electron 和 Chrome、隔离运行时及 Codex CLI 0.171.0 验证。桌面选图片并粘贴 CSV，390px WebUI 选 CSV 并粘贴图片；两端一次回车均向测试模型发出视觉附件和中文提示，引用路径可逐字节读回 CSV。运行时关闭后文件已清理。
- 拆分限制后类型检查、构建、WebUI smoke、689 项单元测试和 15 项集成测试通过。集成测试检查超过 8 MiB 的 CSV 经两条授权路径可逐字节读回、超限 PNG 被拒绝以及 64 MiB 聚合边界。真实 Electron 和 Chrome 也完成大 CSV 加图片提交，Codex 测试模型端只收到普通文件的路径。

## Notes
- 两端都使用系统粘贴事件里的文件数据。剪贴板只提供文本路径时保留文本粘贴语义。
- 已构建两端产物。现有正式服务未重启，无 Git 提交。
