---
kind: sharkbay_task
taskId: R1B6F8-u3960864-m81ae10
taskTag: R1B6F8
mode: task
title: 发布 v0.3.10 Review 路径修复补丁版
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T07:31:54Z
updatedAt: 2026-11-17T07:44:27Z
completedAt: 2026-11-17T07:44:27Z
commits:
  - 45a492088a0a68cd3813b896a64ef914200e5355
  - 59c00d8f2d631991a105336caec65ee848d30561
---

## Summary
已将 Review 路径修复提交推送为 45a4920，发布签名公证的稳定 Latest v0.3.10（五附件），Homebrew 同步成功。501 tests 及正式包内 URI/Runtime 验证通过；保留并行 Agent 状态修改，未升级或重启用户本机/103。

## Files
- src/runtime/application-runtime.ts（只包含 resolveRepo 一行修复）
- tests/web-runtime-integration.test.ts
- package.json（只包含版本更新）
- package-lock.json
- CHANGELOG.md
- README.md
- release/v0.3.10/（忽略的产物与校验记录）
- SharkUI/homebrew-tap/Casks/sharkbay.rb（自动同步）
- .sharkbay/tasks/R1B6F8-u3960864-m81ae10-release-v0-3-10-review-fix.md
- .sharkbay/tasks/V4R9P2-u3960864-m81ae10-fix-review-project-uri.md

## Work
- 用户授权提交并发布 bugfix 补丁版，默认递增至 0.3.10；本次未请求安装升级本机或 103。
- 已读协议、AGENTS.md、发布文档及团队上下文，参考 V4R9P2-u3960864-m81ae10（修复）、R9P4W7-u3960864-m81ae10（正式发布核验流程）。
- 发现工作区并行 Agent 状态功能修改，保留其内容不提交；精确暂存 Review 修复/测试及版本文档，从最终提交独立构建，避免带入其他功能。
- 计划：核对精确提交范围并推送 → 独立构建、测试和签名公证 → 草稿附件校验 → 稳定发布/Homebrew 同步及公开下载验证。
- 精确暂存六文件：版本/README/CHANGELOG、Review 一行转换与 19 行回归用例，提交为 45a4920。同文件中的 Agent 状态 evidence 与打包 NOTICE 改动仍留在工作区，未进入提交。
- 45a4920 已推送 origin/main；独立 worktree npm ci、类型检查和 501 tests 通过，正在 smoke pack 和包内验证。
- pack、编译 WebUI 及包内 Runtime 验证完成；已推送固定到 45a4920 的 v0.3.10 标签并创建 GitHub 草稿，开始 Developer ID 签名公证 dist。
- GitHub 草稿 release 448293251 已准备；Developer ID 签名结束，Apple 公证请求 35631190-c4a7-49fb-85e7-9ded52238714 当前 In Progress。
- Apple 公证通过，正式五附件生成完成；签名 app 和 ZIP 票据/签名验收通过，正式包内 Runtime 与 Review URI 回归通过，开始上传草稿附件。
- 五附件 GitHub 大小与 SHA-256 全匹配后，release 448293251 已公开为稳定 Latest v0.3.10；触发 Homebrew 同步 44040689840，等待结果。未升级/重启用户本机或 103。
- Homebrew 工作流 44040689840 成功，bot 提交 59c00d8，版本及 DMG 摘要匹配。公开附件和更新清单验证通过，独立构建 worktree、临时补丁、ZIP 解包和挂载目录均清理；工作区并行修改仍保留。

## Verification
- 修复任务此前已通过回归先失败后通过、501 tests、类型检查及编译 WebUI 验证；本次将在最终提交再次独立验证。
- 最终提交独立 worktree：npm run typecheck、npm test（73 文件 / 501 tests）通过。
- npm run pack、node scripts/verify-webui-runtime.mjs、node scripts/verify-packaged-runtime.mjs 全部通过。
- smoke 包内使用实际 bundled Node、应用 Resources/runtime 工作目录及独立项目，原生/local/file URI（空格、百分号、中文）均到达正常 Task 校验；未登记目录仍拒绝，未启动真实 reviewer。脚本位于 release/v0.3.10/verify-review-uri.mjs。
- 正式 app 严格签名、Gatekeeper、公证票据及包内 Runtime/Review URI 回归通过；ZIP 解包后的版本 0.3.10、严格签名、Gatekeeper 和票据通过。
- ASAR/外置 Runtime 版本为 0.3.10，包含 URI 修复；编译测试、并行状态功能模块和 NOTICE 未打包。latest-mac.yml 两附件大小/SHA-512 匹配，blockmap 结构及覆盖大小正确；五附件摘要保存为 asset-checksums.json。
- DMG 镜像完整性、只读挂载后的版本/严格签名/公证票据通过，已卸载并清理挂载目录；草稿五附件的大小与 SHA-256 核验记录保存为 remote-asset-verification.json。
- 五个公开附件 URL 均 HTTP 200，公开 latest-mac.yml 与本地字节一致，记录于 public-verification.json。
- Homebrew 44040689840 success；cask 0.3.10、DMG SHA-256 6b54eb17aed654b4cd63729209f97cc4ef8b2b01d88f9db2680fa79b12cb493f 与正式附件匹配。
- origin/main 与 v0.3.10 解引用均为 45a4920；发布提交 git diff --check 通过；GitHub Latest v0.3.10，draft=false、prerelease=false、5 附件。主工作区保留并行功能的未提交改动，未声称工作树干净。

## Notes
- 团队上下文只读；不停止用户运行实例，不将并行状态功能打包。
- GitHub 连接器缺少 Release 附件发布能力，沿用现有 gh CLI。
- 正式版：https://github.com/SharkUI/SharkBay/releases/tag/v0.3.10。更新应用后仍需结束活动工作并显式停止/重启旧共享 Runtime，修复才会生效。
