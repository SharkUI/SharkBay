---
kind: sharkbay_task
taskId: P5C8R1-u3960864-m81ae10
taskTag: P5C8R1
mode: task
title: 项目状态胶囊严格按红黄蓝绿灰汇总
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T10:23:03Z
updatedAt: 2026-11-17T10:24:17Z
completedAt: 2026-11-17T10:24:17Z
---

## Summary
已将项目多 session 状态汇总改为严格红 > 黄 > 蓝 > 绿 > 灰：failed > waiting > blocked > working > monitoring > done > interrupted > unverifiable > idle > unknown，同色内部保持既有顺序。47 项定向测试、类型检查和 diff 检查通过，未提交发布。

## Files
- src/shared/agent-status.ts
- tests/agent-status.test.ts
- docs/agent-status.md
- .sharkbay/tasks/P5C8R1-u3960864-m81ae10-project-pill-color-priority.md

## Work
- 已读取协议、AGENTS.md、只读团队上下文，参考 O7S4K2-u3960864-m81ae10 的新状态模型与五色映射。
- CodeGraph 定位 AGENT_STATUS_RANK、priorityOf 和 agentTabLightState，项目汇总使用共享状态 rank；只调整顺序及对应文档/回归，保留工作区并行改动。
- 计划：增加跨色状态组合回归 → 调整 rank → 定向验证和类型检查。同色状态保留原顺序，不改颜色、session 归属或已读机制。
- 跨色组合回归先复现 failed 低于 waiting 的旧顺序错误；调整共享 rank，将 failed 放至最高、done 放至所有灰色之前，并同步状态文档。
- 只修改本任务声明的三文件内容，保留工作区其他并行改动；项目聚合继续使用现有按 rank 取最高状态的逻辑。

## Verification
- 新增回归覆盖全部跨色状态对，修复前失败、修复后通过。
- npx vitest run tests/agent-status.test.ts tests/renderer-workflow.test.ts tests/island-auto-expand.test.ts：3 文件 / 47 tests 通过。
- 首次类型检查发现新增测试索引可能 undefined，改用 entries 遍历后 npm run typecheck 通过；最终 git diff --check 通过。

## Notes
- 不提交发布或升级运行实例；团队上下文只读。
