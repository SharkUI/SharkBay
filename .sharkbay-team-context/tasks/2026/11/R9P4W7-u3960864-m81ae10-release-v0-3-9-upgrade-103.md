---
kind: sharkbay_task
taskId: R9P4W7-u3960864-m81ae10
taskTag: R9P4W7
mode: task
title: 发布 v0.3.9 并升级 103 首屏性能修复
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T05:42:52Z
updatedAt: 2026-11-17T06:40:36Z
completedAt: 2026-11-17T06:40:36Z
commits:
  - 4d89603c783f1978b1f31d61f6860fc815ba5bbe
  - ac3ed45e5a91e49bdf5521d98b36578663d7a069
---

## Summary
已提交推送性能修复，发布签名公证的稳定 Latest v0.3.9 并同步 Homebrew。103 已升级，新 Runtime 在 17777 免鉴权提供 gzip 与缓存；正式浏览器无缓存 load 1.32 s、缓存 load 139 ms，原配置/项目及旧应用备份保留。

## Files
- package.json
- package-lock.json
- README.md
- CHANGELOG.md
- vite.config.ts
- src/server/http-server.ts
- tests/web-runtime-integration.test.ts
- release/v0.3.9/（忽略的产物和核验记录）
- SharkUI/homebrew-tap/Casks/sharkbay.rb（发布自动同步）
- 远端 /Applications/SharkBay.app
- 远端 ~/.sharkbay/install/v0.3.9/（旧版及配置备份）
- .sharkbay/tasks/R9P4W7-u3960864-m81ae10-release-v0-3-9-upgrade-103.md
- .sharkbay/tasks/P9W3L6-u3960864-m81ae10-webui-initial-load.md

## Work
- 用户已授权发布并升级；沿用补丁版本递增至 0.3.9，保留局域网免鉴权、固定端口与现有配置。
- 已读协议、AGENTS.md 和团队镜像；参考 P9W3L6-u3960864-m81ae10（实现与性能基线）、R8L5N3-u3960864-m81ae10（正式签名发布与远端安装）。
- 计划：检查远端会话 → 更新版本与发布说明并提交推送 → 隔离构建测试、签名公证与附件校验 → 正式发布及 Homebrew → 备份升级、正式地址性能验收。
- 103 当前 Runtime 76466、0 活动终端；origin/main 与工作分支同步，当前 Latest v0.3.8，v0.3.9 tag 不存在。版本、README/CHANGELOG 与三个性能修改已提交为 4d89603，准备该提交的独立构建。
- 4d89603 已推送 origin/main；独立 worktree 的 npm ci 完成。103 旧 0.3.8 应用和 legacy/runtime 配置已备份到 ~/.sharkbay/install/v0.3.9，两份配置均含 1 个项目，旧 Runtime 保持运行。
- 隔离构建的 typecheck、500 tests、pack、编译 WebUI 和包内 Node/SQLite/真实 PTY/显式停止均通过；开始 Developer ID 签名公证的正式 dist，输出 release/v0.3.9。
- v0.3.9 注释标签已推送并固定到 4d89603；GitHub 发布草稿已创建，尚未公开，等待签名公证结束后上传核验五附件。
- Apple 公证通过（e355c802-2ff9-47e3-8fb8-d30ea43208c3），dist 正常完成五附件；用户中断后恢复原进程结果，未重复构建。开始草稿上传与 103 ZIP 暂存。
- 草稿 release 448196581 的五附件已逐项核验大小与 SHA-256；103 暂存 ZIP 同摘要，签名/Gatekeeper/实际包内 Runtime 测试通过。准备公开为稳定 Latest 并切换正式服务。
- v0.3.9 已公开为稳定 Latest，Homebrew 同步运行 44032533745。103 切换前再次确认 0 活动终端，正常停止旧 Runtime；旧桌面 SIGTERM 后未退出，核对其可执行路径后精确结束旧 PID 76461，再替换应用并启动。
- 103 新 Runtime PID 87825、版本 0.3.9；两份配置 SHA-256 不变、保留 1 个项目。正式 17777 响应主 JS gzip 520,672 B、哈希资产 immutable 缓存、HTML no-store；正在浏览器验收。
- 正式 Chrome 页面无缓存主 JS 521 KB / 1.19 s、DOMContentLoaded 1.26 s、load 1.32 s；命中缓存后 JS/CSS 内存缓存 0 ms、DOMContentLoaded 79 ms、load 139 ms，页面已连接并显示原项目。
- Homebrew 工作流 44032533745 成功，bot 提交 ac3ed45，cask 0.3.9 与正式 DMG SHA-256 一致。独立构建 worktree 和远端暂存 ZIP/解包/验证脚本已清理，保留正式产物、旧应用和配置备份。

## Verification
- 前一实现任务已通过 typecheck、500 tests、编译 WebUI/真实 PTY 及 103 隔离实例浏览器验证。
- 最终提交、签名附件、稳定发布、Homebrew 与远端正式升级已核对完成，详见以下记录。
- 最终提交独立 worktree：npm run typecheck、npm test（73 文件 / 500 tests）、npm run pack、node scripts/verify-webui-runtime.mjs、node scripts/verify-packaged-runtime.mjs 全部通过。
- 正式 app 严格签名、Gatekeeper 与公证票据通过；ZIP 解包后的版本 0.3.9、严格签名、Gatekeeper 与票据通过。
- ASAR 与外置 Runtime 均为 0.3.9，编译测试未打包；latest-mac.yml 的两附件大小及 SHA-512 匹配，两份 blockmap 结构及覆盖长度正确；五附件 SHA-256 记录到 release/v0.3.9/asset-checksums.json。
- DMG 镜像完整性、只读挂载后的版本/严格签名/公证票据通过；正式签名 app 再次通过包内 Runtime 验证。
- 103 暂存 app 签名、Gatekeeper 和包内 Node/SQLite/PTY、桌面退出存活及显式停止通过；GitHub 草稿附件核验记录保存为 remote-asset-verification.json。
- 五个公开附件 URL 均 HTTP 200，公开 latest-mac.yml 与本地字节一致，记录于 public-verification.json。
- 103 正式安装的版本、新进程路径、配置哈希/项目数与无 Cookie capabilities 200 通过；主 JS 实测传输 520,672 B / 1.172 s。
- 正式跨主机无 Cookie/令牌的 capabilities、WS hello、config.get 均成功且未设置会话 Cookie；Chrome 正式 URL 显示已连接及原项目，冷/热加载结果保存到 browser-verification.json。
- Homebrew 运行 44032533745 success；cask 版本 0.3.9、SHA-256 5b6d0aae1f9a64e6a0ca079a8ebcbde1af6890e9b60bc82a59e31667198e6fb5 与正式 DMG 一致。
- 最终 HEAD、origin/main 与 v0.3.9 解引用提交均为 4d89603；工作树干净、git diff --check 通过、GitHub Latest v0.3.9（5 附件、非草稿非预发布）。清理后远端 Runtime 87825 仍监听 *:17777。

## Notes
- 团队上下文只读；不修改远端项目仓库源码，不记录配置内容、令牌或私人会话。
- 本次发布包含上一任务三个已验证修改，不扩大功能范围。
- 正式版：https://github.com/SharkUI/SharkBay/releases/tag/v0.3.9；访问：http://10.0.0.103:17777/。备份：~/.sharkbay/install/v0.3.9/。
- 浏览器测量为 Chrome Network 导航 load/DOMContentLoaded，未测 FCP/LCP；数据不代表所有项目后台请求完成时间。
