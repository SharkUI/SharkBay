---
kind: sharkbay_task
taskId: L6P3R9-u3960864-m81ae10
taskTag: L6P3R9
mode: task
title: 恢复本机及局域网 WebUI 直接访问
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1edf1-0eb3-7c32-ae19-51cc6395dc3f
branch: main
createdAt: 2026-11-18T10:12:00Z
updatedAt: 2026-11-18T10:44:13Z
completedAt: 2026-11-18T10:44:13Z
commits:
  - 4f660c1077dba1928ca4ce3fc0da1df9ce354e34
---

## Summary
已恢复本机/局域网以 IP:17777 直接访问 WebUI，无需 grant/cookie，命令行输出普通地址；公网授权及 Host/Origin/终端控制校验保留。类型、45 项定向/集成测试、编译 CLI/PTY 和 Chrome 无痕直连刷新验证通过，已提交 4f660c1；未推送、重新打包或部署 103。

## Files
- .sharkbay/tasks/L6P3R9-u3960864-m81ae10-webui-direct-lan-access.md
- src/server/session-auth.ts
- src/server/http-server.ts
- src/server/main.ts
- tests/web-runtime-security.test.ts
- tests/web-server-auth.test.ts
- tests/web-runtime-integration.test.ts
- README.md
- docs/current-facts.md
- docs/development.md
- scripts/verify-webui-runtime.mjs

## Work
- 已读取团队任务 N4L7A2-u3960864-m81ae10，以及 docs/audit/2026-11-17/security-data.md 和 fixes/git-auth-fixes.md；旧版支持 LAN 直连，审计后统一恢复 grant/cookie。
- 用户本次明确要求免验证码，采用实际 TCP 对端判断本机/RFC1918/IPv4 link-local，其他来源保留可撤销授权。已说明同一局域网可达设备将可操作项目和终端。
- 计划：先复现无 Cookie HTTP/WS 失败 → 恢复直连并更新启动输出及当前文档 → 类型、定向/集成测试与编译 WebUI 验证。
- 起始 main 工作区干净；不修改历史审计结论，不自动重启/部署 103。
- 恢复实际 TCP 对端的 LAN 判断，并贯穿 HTTP、WS、帧处理和心跳校验；保持正文读取/异步终端检查后的二次校验。公网测试在鉴权边界模拟公网对端，验证过期/撤销及慢请求阻断；真实本机/LAN 集成不使用 grant/cookie。
- CLI 启动及已运行 daemon 的重连输出改为普通地址，Enter/connect 不再生成验证码；README、development 和 current-facts 同步当前信任契约。
- Chrome 新无痕窗口通过本机 LAN IPv4 普通地址直连并刷新，均显示已连接；未使用授权片段。隔离 profile、随机测试端口、浏览器窗口及临时数据均已清理，未操作日常 Runtime。
- 用户明确要求提交；已核对工作区仅包含本任务的 10 个源码、测试和文档文件，暂存区原为空。沿用已通过的类型、定向/集成及编译验证，不重复执行无新变更的检查；提交前检查暂存差异。
- 已提交 4f660c1077dba1928ca4ce3fc0da1df9ce354e34（feat: restore direct local and LAN WebUI access），包含核定的 10 个文件；任务文件按现有忽略规则保留本地。

## Verification
- 新增回归在旧实现先失败：10 项失败（本机/私网免 Cookie、实际 HTTP 直连），21 项已有公网/边界测试通过。
- 实现后 31 项安全/HTTP/WS 测试及 14 项真实 Runtime 集成通过；类型检查通过。集成覆盖真实 LAN、Cookie-free bridge、PTY 输入、重连、终端接管、Host/Origin 拒绝和 revoke 后本机/LAN 继续访问。
- `npm run verify:webui` 编译和实际 Node CLI、静态 WebUI、无 Cookie HTTP/WS、PTY 输入及停止清理均通过；正在补充 CLI 启动/连接既有 daemon 输出无验证码的断言。
- 补充断言后 `node scripts/verify-webui-runtime.mjs` 再次通过：首次启动及连接既有 daemon 输出均无 #connect，实际 HTTP/WS/PTY 与停止清理正常。
- 真实 Chrome 无痕直连及刷新通过；`git diff --check` 通过。CodeGraph affected 未关联测试，已手动选择上述相关回归；未扩大为全量测试。
- 提交前 `git diff --cached --check` 通过，提交后核对文件范围、完整哈希和 `git status --short`，工作区干净。

## Notes
- 此任务明确调整当前网络信任契约；保留 Host/Origin、命令字段及终端控制校验，不信任转发头。LAN 网络信任不能通过 revoke 撤销；revoke 仍撤销公网 grant/session。
- 103 目前安装的包来自本任务之前的复制，不包含本次修改；需要另行重新打包同步并重启 Runtime 才生效。
