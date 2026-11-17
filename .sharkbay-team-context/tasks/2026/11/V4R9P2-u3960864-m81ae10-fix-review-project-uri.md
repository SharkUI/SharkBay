---
kind: sharkbay_task
taskId: V4R9P2-u3960864-m81ae10
taskTag: V4R9P2
mode: task
title: 修复 Review 启动时项目 URI 被当作相对路径
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T07:15:07Z
updatedAt: 2026-11-17T07:44:27Z
commits:
  - 45a492088a0a68cd3813b896a64ef914200e5355
completedAt: 2026-11-17T07:18:07Z
---

## Summary
已复现并修复 Review 启动入口将 local: 项目 URI 当作相对路径的 ENOENT。桌面/WebUI 回归、501 tests、类型检查及正式包内 URI 验证通过，随 45a4920 / v0.3.10 正式发布；未升级用户日常实例。

## Files
- .sharkbay/tasks/V4R9P2-u3960864-m81ae10-fix-review-project-uri.md
- src/runtime/application-runtime.ts
- tests/web-runtime-integration.test.ts

## Work
- 已读取协议、AGENTS.md、检索只读团队上下文，参考 C4R8K6-u3960864-m81ae10 和 9NOEQ2-u3960864-m81ae10。用户新截图明确为路径 ENOENT，与克隆仓库超时分别处理。
- 计划：对照当前源码与本机已安装 0.3.6 的 Review 路径 → 用回归测试复现 → 最小修复并验证 URI/原生路径兼容和项目访问边界。
- 确认 ApplicationRuntime 的 resolveRepo 将 local: 原样传入 resolveRepoPath，触发 path.resolve 将 URI 变成应用工作目录下的相对路径；已有 fileURLToLocalPath 可复用，只修改统一入口一行。ReviewRunManager 后续转换发生得太晚。
- 使用真实 Runtime、桌面私有 socket 和 HTTP command 做回归：原生路径、local URI、file URI、空格/百分号/中文路径均应到达 Task 校验；未登记项目仍应在目录边界拒绝。不创建真实 reviewer 或用户文件。
- 新测试先复现与用户相同的 ENOENT（仓库 URI 被拼到当前目录），随后在统一 resolveRepo 入口使用已有 fileURLToLocalPath，一行修复。源码及已安装 0.3.6 都存在该遗漏，单纯升级到当前 0.3.9 不会解决。
- 完成代码验证；保留本机日常实例、用户仓库和配置，未发布或重启。测试只验证 Review 到达正常 Task 校验，不自动启动 reviewer。
- 用户后续授权提交发布；修复与回归测试已随 45a4920 提交，发布过程记录在 R1B6F8-u3960864-m81ae10。
- R1B6F8-u3960864-m81ae10 已完成稳定 v0.3.10、签名公证附件与 Homebrew 发布；包内实际 Node 及应用工作目录复测 URI 路径正确。

## Verification
- 已用回归测试复现用户所示 local:/Users/... 被 realpath 解析为应用目录下相对路径的问题。
- 回归测试修复前失败，修复后桌面/WebUI 的四种有效输入到达 Task 校验，越界 local/file URI 仍被拒绝；不启动真实 agent。
- 定向集成/Review/路径测试 23 项通过；npm run typecheck 与全量 73 文件 / 501 tests 通过；git diff --check 通过。
- npm run verify:webui 通过编译 CLI、无 Cookie API/WS、真实 PTY 输出及退出清理；只改 ApplicationRuntime 一行与一个回归用例，最终 git diff --check 通过。

## Notes
- 不停止或修改本机日常运行实例，不创建真实 reviewer 会话；团队上下文只读。
- 本次先修复验证代码，未授权额外发布或升级本机。
