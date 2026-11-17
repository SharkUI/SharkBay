---
kind: sharkbay_task
taskId: N4L7A2-u3960864-m81ae10
taskTag: N4L7A2
mode: task
title: 局域网直接访问 WebUI，无需鉴权
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T04:28:01Z
updatedAt: 2026-11-17T04:40:21Z
commits:
  - 4b81842cace9fa0974fb09d38b2464dd0ea1f088
completedAt: 2026-11-17T04:36:58Z
---

## Summary
已让本机和局域网浏览器直接使用 WebUI，无需一次性链接或会话 Cookie；保留 Host/Origin、终端控制权和其他来源的原有访问限制。类型检查、498 项测试、编译验证和 Chrome 无痕直连/刷新验证通过，已提交为 4b81842，发布升级由 R8L5N3-u3960864-m81ae10 跟进。

## Files
- src/server/http-server.ts
- src/server/session-auth.ts
- src/server/main.ts
- README.md
- tests/web-runtime-integration.test.ts
- tests/web-runtime-security.test.ts
- scripts/verify-webui-runtime.mjs
- .sharkbay/tasks/N4L7A2-u3960864-m81ae10-lan-without-auth.md

## Work
- 已通过 CodeGraph 定位服务与鉴权实现，检索并读取相关团队上下文；参考 L8R3W7-u3960864-m81ae10 与 R7N4V9-u3960864-m81ae10。
- 用户明确局域网访问无需鉴权，覆盖先前沿用的一次性授权设计；保留 Host/Origin 与命令来源校验，局域网识别以实际 TCP 对端为准。
- 计划：先增加无 Cookie 的本机/LAN HTTP、WS 和终端回归 → 实现绕过鉴权及更新使用说明 → 类型、测试、构建和真实浏览器验证。
- 已复现无 Cookie 访问失败：针对性测试 27 项预期失败。实现实际 TCP 对端的 loopback、RFC1918 与 IPv4 link-local 免鉴权，保留其他来源的原有鉴权。
- 本机与 LAN 启动输出改为普通地址；README 与编译验证脚本同步说明和验证免授权访问，不再依赖连接链接。
- 无 Cookie 的真实 bridge 覆盖 HTTP 命令、WS、PTY 输入、接管与自动重连；LAN 连接不会被鉴权过期或 revoke 中断。
- 真实 Chrome 无痕窗口使用不含 #connect 的 LAN 地址成功直连、创建终端并刷新恢复；测试窗口关闭，隔离 Runtime、终端和临时项目均已清理。
- 用户随后授权提交发布并升级远端，提交为 4b81842；后续发布结果见 R8L5N3-u3960864-m81ae10。

## Verification
- 修改前针对性回归 27 项失败、9 项通过，确认原代码对本机/LAN 返回 401。
- 类型检查和 npm run verify:webui 通过，编译后的 CLI、静态资源、无 Cookie 直连、WS、真实 PTY 与退出清理均正常。
- 新增公网模拟用例尝试替换 Node 不可配置的 remoteAddress 失败，已移除该模拟；公网/私网边界由 18 项实际地址单元用例及既有会话生命周期测试覆盖，继续运行全量回归。
- 最终 `npm test`：73 个测试文件、498 项全部通过；`git diff --check` 通过。
- Chrome 无痕窗口直接打开普通 LAN URL，无先前 Cookie、无授权片段，显示已连接，创建终端成功，刷新后保留终端并保持连接。

## Notes
- 本任务不重新发布、不修改已发布的 v0.3.7、不重启远端或用户现有 Runtime。
- 团队上下文只读；仅本机/局域网免鉴权，其他来源保留现有访问限制。
- 已发布及远端当前运行的 v0.3.7 尚未包含本次修改；部署需更新构建并重启 Runtime。
