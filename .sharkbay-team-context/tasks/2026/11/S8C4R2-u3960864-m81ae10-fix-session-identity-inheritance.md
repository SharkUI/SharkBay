---
kind: sharkbay_task
taskId: S8C4R2-u3960864-m81ae10
taskTag: S8C4R2
mode: task
title: 修复任务会话身份继承污染
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e8c9-f7b3-7982-80af-46548857784e
branch: main
createdAt: 2026-11-17T09:20:33Z
updatedAt: 2026-11-17T09:24:07Z
completedAt: 2026-11-17T09:24:07Z
---

## Summary
已修复新终端继承父会话身份及 Codex 采集旧恢复 ID 的问题：新终端隔离会话身份，采集优先当前原生线程，指定会话恢复及其他 agent 保持兼容。

## Files
- src/main/terminal.ts
- src/main/harness.ts
- tests/terminal.test.ts
- tests/harness.test.ts
- .sharkbay/harness/agent-session-id.sh
- .sharkbay/tasks/S8C4R2-u3960864-m81ae10-fix-session-identity-inheritance.md

## Work
- 已检索团队上下文，关联既有任务 3E963D-u3960864-m81ae10、S5R2T9-u3960864-m81ae10、R7S4M2-u3960864-m81ae10。
- 只读排查发现 shark.zj.cn 的 WTB8K3 与多条 SharkBay 任务指向同一 SharkBay 会话；恢复入口直接使用任务 sessionId，终端环境完整继承宿主环境。
- 先补充可复现回归，再实施最小修复；保留无关未提交修改，不改写缺少确切对应关系的历史任务。
- 已补充真实 PTY 的新建/恢复启动回归，以及 Codex 切换原生线程时旧恢复 ID 覆盖当前 ID 的回归。
- 新 PTY 清除宿主的 CODEX_THREAD_ID、SHARKBAY_RESTORED_SESSION_ID、SHARKBAY_SESSION_ID；采集脚本优先当前 Codex 原生线程，仅缺失时回退恢复 ID，同步本地受管脚本。
- PTY 回归同时检查恢复 CLI 参数及终端 ID，确认显式恢复身份仍传入 agent，并且不修改宿主环境；临时捕获仅包含测试需要的会话字段。

## Verification
- 验证范围为真实 PTY 启动、恢复参数传递、采集优先级及完整类型检查。
- 修复前针对性测试：40 通过、3 失败；两条 PTY 回归复现父会话身份继承，采集回归复现旧恢复 ID 覆盖原生线程。
- `npm test -- tests/terminal.test.ts tests/harness.test.ts tests/agent-session-restore.test.ts`：47/47 通过。
- `npm run typecheck`：renderer、node、runtime 全部通过。
- 本地受管脚本与源码生成内容逐字一致；`sh -n .sharkbay/harness/agent-session-id.sh`、`git diff --check` 通过。
- 当前真实 Codex 线程注入不同旧恢复 ID 后，采集脚本仍返回当前 CODEX_THREAD_ID。
- 缩小 PTY 测试临时捕获字段后复跑 `npm test -- tests/terminal.test.ts`：15/15 通过；最终 `git diff --check` 通过。

## Notes
- .sharkbay/team-context/ 只读。本任务不提交、不部署、不重启用户服务。
- 历史任务存在可疑跨项目重复 ID，但不能仅凭目录差异自动重写；正常跨目录恢复仍应保留 Codex 的目录确认提示。
- 既有 src/main/terminal.ts 中 SHARKBAY_AGENT_LAUNCH_TOKEN 修改属于其他工作，原样保留。
