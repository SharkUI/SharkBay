---
kind: sharkbay_task
taskId: R8L5N3-u3960864-m81ae10
taskTag: R8L5N3
mode: task
title: 发布 v0.3.8 并升级 103 免鉴权访问
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T04:39:06Z
updatedAt: 2026-11-17T04:55:42Z
completedAt: 2026-11-17T04:55:42Z
commits:
  - 4b81842cace9fa0974fb09d38b2464dd0ea1f088
  - df60c27092b5367b0f0db8c6e98b1f9f8f51c024
---

## Summary
已提交推送免鉴权修改，发布签名公证的稳定 Latest v0.3.8，并同步 Homebrew。103 已升级并运行新版 Runtime，普通 URL 在无 Cookie 的 API/WS 和 Chrome 无痕窗口中均可直接使用，原配置及旧应用备份保留。

## Files
- package.json
- package-lock.json
- README.md
- CHANGELOG.md
- src/server/session-auth.ts
- src/server/http-server.ts
- src/server/main.ts
- tests/web-runtime-security.test.ts
- tests/web-runtime-integration.test.ts
- scripts/verify-webui-runtime.mjs
- release/v0.3.8/（忽略的正式产物及验证记录）
- SharkUI/homebrew-tap/Casks/sharkbay.rb（自动发布同步）
- 远端 /Applications/SharkBay.app
- 远端 ~/.sharkbay/install/v0.3.8/（安装暂存与备份）
- .sharkbay/tasks/R8L5N3-u3960864-m81ae10-release-v0-3-8-upgrade-103.md

## Work
- 用户明确授权提交发布并升级 103，默认递增补丁版至 0.3.8；只包含已完成的局域网免鉴权工作。
- 已读取协议、AGENTS.md、发布文档和团队上下文；参考 N4L7A2-u3960864-m81ae10（免鉴权实现）和 R7N4V9-u3960864-m81ae10（签名、公证、草稿核验与远端安装流程）。
- 计划：检查远端活动会话 → 版本/发布说明与提交推送 → 隔离构建、签名公证和附件核验 → 稳定发布/Homebrew 同步 → 备份升级并重启远端，验证无 Cookie 的 HTTP/WS 和浏览器直连。
- 远端检查确认当前 0.3.7 Runtime 正常，活动终端为 0；分支与 origin/main 同步，线上 Latest 为 0.3.7，0.3.8 tag 尚不存在。
- 已将版本及 README/CHANGELOG 更新为 0.3.8，与免鉴权实现提交为 4b81842；创建固定到该提交的隔离构建 worktree。
- 4b81842 已推送 origin/main；隔离 worktree 的 npm ci 完成，开始类型检查、全量测试及 smoke pack。正式发布说明已准备。
- 正在远端备份 0.3.7 应用、legacy 和 runtime 两份配置，备份配置使用私有文件权限；旧 Runtime 暂不停止。
- 远端备份已完成；最终提交的隔离类型检查、498 项测试及 smoke pack 均通过，进入编译 WebUI 和包内 Runtime 验证。
- 编译 WebUI 与 smoke 包内 Runtime 验证通过，已启动 Developer ID 签名、公证的正式 dist，输出到 release/v0.3.8。
- 正式 app 签名完成，Apple 公证提交 2d73449e-64f6-4032-bea0-acea0c752dd8 为 In Progress；远端 main 已确认指向发布提交 4b81842。
- Apple 公证通过，正式五附件已生成；v0.3.8 注释 tag 推送完成，开始上传 GitHub 草稿和远端安装暂存 ZIP。
- GitHub 草稿 release 448149681 已创建，小附件上传完成，安装包仍在上传；ZIP 已传到远端，开始暂存签名及真实包内验证，旧 Runtime 保持运行。
- 五附件已全部上传，草稿阶段逐项核对大小与 GitHub SHA-256 完全匹配；远端暂存包通过签名、Gatekeeper 和实际 macOS 上的包内 Node/SQLite/PTY 生命周期验证，准备公开并升级。
- v0.3.8 已公开为稳定 Latest，Homebrew 工作流 44019944120 已成功；五个公开下载 URL 与生产 manifest 验证通过。
- 切换前再次确认远端活动终端为 0，已显式正常停止旧 Runtime。旧桌面客户端未响应 SIGTERM，首次替换在退出等待阶段中止，未修改应用；随后核对可执行文件路径，精确结束旧桌面 PID 后重试安装，配置与旧应用备份保留。
- 远端 0.3.8 已安装启动，Runtime 从旧 PID 73294 切换为 76466，桌面 PID 76461，监听 *:17777；legacy/runtime 两份配置 SHA-256 均未变化，保留 1 个项目。
- 本机跨主机无 Cookie 的 capabilities、WS hello 与 config.get 成功；普通 Chrome 页面刷新恢复，全新无痕窗口直接打开同一普通 URL 显示已连接。
- Homebrew 同步成功并生成 df60c27，版本及 DMG 摘要匹配；清理隔离构建 worktree、挂载/解包目录及远端新版暂存包，保留正式发布产物和旧应用/配置备份。

## Verification
- 版本更新后 npm run typecheck、git diff --cached --check 通过；上一个实现任务的 498 项测试与无痕直连验证已通过。
- 隔离 worktree 的 npm run typecheck、npm test（73 文件 / 498 项）、npm run pack 全部通过。
- node scripts/verify-webui-runtime.mjs 通过无令牌/Cookie 的 HTTP、WS、真实 PTY 及退出清理；node scripts/verify-packaged-runtime.mjs 通过包内 Node/SQLite/PTY、客户端退出存活及显式停止。
- 正式包 ASAR 与外置 Runtime 均为 0.3.8，编译测试未打包；codesign --verify --deep --strict 通过。
- 最终签名 app Gatekeeper、公证票据与包内 Runtime 验证通过；ZIP 解包后版本、严格签名、Gatekeeper 与票据通过。
- DMG 镜像 CRC 正确；latest-mac.yml 两个附件的大小与 SHA-512 一致，两份 blockmap 校验正确，五附件 SHA-256 记录到 release/v0.3.8/asset-checksums.json。
- DMG 只读挂载后 app 版本、严格签名和公证票据均通过，已正常卸载挂载点并清理临时目录。
- 远端 ZIP SHA-256 与本地一致，版本 0.3.8，严格签名及 Gatekeeper 通过；隔离包内 Runtime 验证通过，未停止日常旧实例。
- GitHub 草稿五附件大小、摘要均匹配，核验记录位于 release/v0.3.8/remote-asset-verification.json。
- GitHub 五个公开附件 URL 均 HTTP 200，公开 latest-mac.yml 与本地字节一致。
- 首轮远端验收因旧桌面退出超时、尚未启动新版而失败；正在替换完成后重新验收，未将该检查记为通过。
- 重试替换后远端验收通过：实际版本 0.3.8、新 Runtime PID、17777 端口、无 Cookie 的本机 capabilities 200 且无 Set-Cookie、配置哈希与项目数保留。
- 跨主机 LAN HTTP/WS/command 均未提供令牌或 Cookie，返回成功且未设置会话 Cookie；Chrome 普通窗口与无痕窗口直接访问普通 URL 均显示已连接。
- Homebrew 工作流 44019944120 success；cask 版本 0.3.8，SHA-256 eb7eb37e098bb96eedaabe2b89613d0a991b024c6920ef0c7f8175d12c8bcc9e 与正式 DMG 一致。
- GitHub Latest 为 v0.3.8（draft=false、prerelease=false、5 附件）；最终工作树干净、HEAD/origin/main 分歧 0/0、git diff --check 通过。

## Notes
- 团队上下文只读；保留远端原配置及旧版本备份，不记录授权令牌或私人会话内容。
- 重启前检查远端会话；不停止本机用户的日常 Runtime。
- 稳定版：https://github.com/SharkUI/SharkBay/releases/tag/v0.3.8；远端直接访问：http://10.0.0.103:17777/。
- 远端备份位于 ~/.sharkbay/install/v0.3.8/，包括旧 0.3.7 应用和两份配置；本次未修改远端配置的项目仓库源码。
