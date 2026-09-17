---
kind: sharkbay_task
taskId: P7N4K2-u3960864-m81ae10
taskTag: P7N4K2
mode: task
title: Show latest three open issues and PRs with totals
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a09f69-0069-7100-bd13-47b5b920a4b4
branch: main
createdAt: 2026-09-14T10:15:31Z
updatedAt: 2026-09-14T10:25:47Z
completedAt: 2026-09-14T10:25:47Z
commits:
  - 11613c83630db6f20aecc13430590d06644357f0
---

## Summary
右侧 Git 侧栏分别展示最新创建的最多 3 条 open issue 和 open PR，标题标注各自完整总数，PR 辅助信息移到下一行避免挤掉标题。变更已提交并推送至 origin/main。

## Files
- src/main/github.ts
- src/shared/types.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/styles/app.css
- tests/github.test.ts

## Work
- 读取协议、根 AGENTS.md 和 design-semantic-interfaces 技能；工作区初始干净。
- 使用 CodeGraph 定位 GitHubCards、readGitHubInfo 和相关类型。
- 检索并阅读团队任务 GHB7K2-u3960864-m81ae10；沿用已有 GitHub 异步加载、卡片和打开链接交互。
- 计划：确认数据和组件 → 实现各 3 条与完整总数 → 运行针对性检查并验证真实渲染。
- 确认 PR 卡片已存在；改用现有 gh repo view 请求同时读取 open 总数，列表 limit 从 10 改为 3，无需新增请求或 GraphQL 实现。
- 界面模型：issue 与 PR 是并列仓库对象；保留卡片、标题总数和点击打开语法。加载/不可用时隐藏 GitHub 区域，空集合隐藏对应卡片，有数据时各展示最多 3 条。
- 完成总数字段、列表上限和标题计数修改，新增数据读取回归测试；真实渲染验证进行中。
- Safari 渲染真实 GitDetailTab 与项目样式，发现 PR 分支/徽标在窄栏挤掉标题；将 PR 辅助信息移至下一行并限制其宽度，保留 issue 布局。
- 完成实现、针对性测试、构建和真实组件渲染检查；临时验证服务、脚本与标签页已清理。未创建提交。
- 用户要求 commit & push：恢复任务，核对本任务 6 个文件的差异后提交并推送 main。
- 提交 11613c83630db6f20aecc13430590d06644357f0（Show latest three open issues and PRs with full totals），推送 origin/main 成功。

## Verification
- `npm run typecheck` 通过。
- `npx vitest run tests/github.test.ts tests/ipc-channels.test.ts`：2 文件 / 9 测试通过，覆盖完整总数与 3 条列表、issue 查询失败时 PR 独立可用、gh 不可用。
- 实测现有 gh repo view 可直接返回 open issue/PR totalCount；查阅 GitHub CLI 官方源码确认列表默认按 CREATED_AT DESC 排序。
- `npm run build` 通过，PR 样式调整后重新构建通过；`git diff --check` 通过。
- Safari 使用临时 Vite 入口挂载真实 GitDetailTab 与项目 CSS：确认 issue/PR 各 3 条、标题总数 27/14、两类单独显示、点击传入正确 URL、空/加载/读取失败状态正常；复查 280px 深色与 360px 浅色布局，PR 标题可读。
- 真实 readGitHubInfo 返回当前仓库 open PR #19、总数 1，浏览器组件正确显示；当前 open issue 总数为 0。
- CodeGraph affected 未映射到测试，按数据读取与 IPC 边界选取上述测试；未运行无关全量测试或重新打包安装应用。
- 提交前 git diff --check 通过，差异与已验证实现一致；git fetch origin 后确认 main 未分叉。git push origin main 成功，git status 确认工作区干净且 main 与 origin/main 同步。

## Notes
- “最新”按创建时间倒序解释；团队上下文只读。
- 计数来自 gh repo view 的 issues/pullRequests.totalCount（open 状态）；列表继续使用 gh issue/pr list 的默认创建时间倒序，不增加请求。
