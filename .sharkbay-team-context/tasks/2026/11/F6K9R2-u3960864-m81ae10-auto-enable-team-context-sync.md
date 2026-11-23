---
kind: sharkbay_task
taskId: F6K9R2-u3960864-m81ae10
taskTag: F6K9R2
mode: task
title: Runtime 自动接通团队上下文同步
status: completed
completedAt: 2026-11-21T13:05:10Z
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1fe25-b227-7c43-932a-5fc49845d5a0
branch: main
createdAt: 2026-11-21T12:44:39Z
updatedAt: 2026-11-23T06:43:00Z
commits:
  - 78ce78002457234e82c31d66220bdee667c0b21c
---

## Summary
Runtime 先安装本地 Harness，再在打开项目或发现 origin 变化时自动连接具有写权限的 GitHub 仓库。后台负责创建或采用团队上下文分支、补传已完成任务和退避重试，凭据及权限问题在任务页显示。

## Files
- .sharkbay/tasks/F6K9R2-u3960864-m81ae10-auto-enable-team-context-sync.md
- src/runtime/task-runtime.ts
- src/runtime/application-runtime.ts
- src/main/git.ts
- src/main/harness.ts
- src/main/teamwork-sync.ts
- src/renderer/App.tsx
- src/renderer/project-start.tsx
- tests/task-runtime.test.ts
- tests/task-runtime-install.test.ts
- tests/teamwork-sync.test.ts
- tests/harness-boundaries.test.ts
- tests/teamwork-mirror.test.ts
- tests/project-tasks-switch.test.ts

## Work
- 本地安装优先。首次安装先写入 Harness。离线、凭据失效或远端写权限不足时，本地任务仍可正常读写。
- 自动接通同步。Runtime 打开已有 Harness 的项目或检测到 origin 变化时，在后台检查当前 GitHub 仓库。保留机器 ID 和本地任务，接通后按现有规则补传已完成任务。
- 分支初始化可重试。远端分支存在时拉取，确认缺失时创建。查询失败按实际原因处理，并发创建时重新读取远端，推送成功后拉取失败时从拉取继续。
- 后台恢复。暂时性失败自动退避重试，凭据或权限问题在任务页显示具体原因。
- 在 linux-webui 工作树接手，保留原任务身份和创建分支。已查阅 1ZRFFN-u3960864-m81ae10、K4WBEA-u3960864-m81ae10 和 S9K4M2-u3960864-m81ae10。
- 定位到同步由本地追踪引用触发，且初始化把远端查询和拉取错误一并当作分支缺失。改由 Runtime 在项目打开后调度，并在确认分支缺失后才创建。
- 首次安装先写本地 Harness，Runtime 按项目观察 origin。权限可用后自动初始化并同步，失败时退避，任务页复用现有状态并显示可处理的原因。
- 分支创建只在 Git 确认分支缺失时执行。拉取和补传使用同一提交快照，避免其他 Git 操作改变本轮的计算基线。

- 浏览器检查发现首次后台补齐身份时 Harness 示例也需更新，且同一工作区起始页需刷新安装状态。

- 修复后台补齐身份导致的 Harness 更新误报。项目起始页与 Tasks 安装状态同步刷新。
- GitHub origin 的读取地址和推送地址必须指向同一仓库。远端变化后保留机器 ID 和本地记录，按现行规则补传已完成任务。
- 改动保留在当前工作树，未创建 Git 提交。

## Verification
- npm test 通过，93 个测试文件共 697 项。覆盖离线首次安装与恢复、添加及更换 origin、另一工作区采用已有分支、并发创建、查询失败、推送后拉取失败和权限及凭据问题。
- 最终同步相关回归 12 项通过。npm run typecheck 和 git diff --check 通过。
- npm run test:integration 通过 17 项，Harness 主机测试通过 28 项，npm run verify:webui 通过。
- 在 Chrome 验证隔离 WebUI。只读 origin 仍可安装和查看本地任务，任务页显示权限原因。切换到可写 origin 后，分支自动创建、已完成任务补传、原机器 ID 和本地记录保留，任务页恢复正常。使用模拟 GitHub 凭据及本地裸仓库验证。

## Notes
- 起因见 K8T3H7-u3960864-m81ae10，本工作树的团队镜像中暂无该条目。
- 1ZRFFN-u3960864-m81ae10 已确立只读远端仍可使用本地 Harness 的行为。
- 后续通过 P4M7T9-u3960864-m854bf2 一并提交已部署的源码，哈希见 `commits`。
