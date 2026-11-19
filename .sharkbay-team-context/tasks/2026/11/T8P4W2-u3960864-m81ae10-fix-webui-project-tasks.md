---
kind: sharkbay_task
taskId: T8P4W2-u3960864-m81ae10
taskTag: T8P4W2
mode: task
title: 修复 WebUI 切换项目后 Tasks 不更新
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1edf1-0eb3-7c32-ae19-51cc6395dc3f
branch: main
createdAt: 2026-11-18T15:07:00Z
updatedAt: 2026-11-19T02:58:39Z
completedAt: 2026-11-19T02:58:39Z
---

## Summary
已通过 TasksDetailTab 的项目 key 修复 WebUI 切换项目后 Tasks 列表/详情沿用旧项目状态的问题。回归测试及隔离真实 Safari 的切换、空项目、隐藏后切换、文件刷新与页面刷新验证通过；修改尚未提交、发布或安装。

## Files
- .sharkbay/tasks/T8P4W2-u3960864-m81ae10-fix-webui-project-tasks.md
- src/renderer/App.tsx（仅 TasksDetailTab 的项目 key）
- tests/project-tasks-switch.test.ts

## Work
- 已读取协议、AGENTS.md 和 design-semantic-interfaces 技能，CodeGraph 初查 App 的项目选择与 TasksDetailTab。
- 参考只读团队任务 M7W2K9-u3960864-m81ae10（切换保留组件身份）、H7P4K9-u3960864-m81ae10、V4R9P2-u3960864-m81ae10（Runtime URI 规范化）。
- 语义约束：项目选择是 Tasks 数据归属的唯一上下文；加载、切换、任务事件和迟到响应均不能混入其他项目。
- 计划：复现两个项目的切换与刷新 → 最小修复并补有意义的回归 → 类型/相关测试及隔离真实 WebUI 来回切换验证。
- 起始主工作区干净，不自动发布、升级或重启 103。

- 实际 TasksDetailTab 没有项目身份边界，列表/详情/菜单/status/busy 状态跨 candidate 保留。新增真实 React 回归复现慢加载仍显示旧详情、隐藏 Tasks 后切换且请求失败仍显示旧列表两项失败；已有迟到请求清理可复用。
- 最小修复是在 TasksDetailTab 添加 key={candidate.uri}，项目切换重新建立 Tasks 状态，父级标签选择保持。3 项回归通过，正在隔离真实 Safari 验证。
- 工作期间出现其他并行修改（config/App/electron 等启动项相关），保持原样；本任务 App 仅增加一行 key，不提交其他修改。

- 用户指出本任务尚未完成；恢复剩余空项目/任务 watcher/往返切换真实渲染验收。机器已重启，原临时验证实例不存在，重建隔离三项目 fixture，不操作日常 Runtime/103。共享工作区仍有 Island 设置相关修改，本任务只拥有 Tasks 项目 key 和回归测试。

- 完成真实 Safari 验收：Alpha 详情→Beta 列表→Empty 无旧任务；Tasks 标签随项目切换保持，隐藏 Tasks 后切回 Alpha 正确加载；Beta 文件更新立即反映，Alpha 后台更新不混入 Beta，页面刷新后重新打开 Tasks 及往返仍正确。
- 沿用既有最小修复，无新增产品代码修改；仅清理本任务临时 Runtime/fixture，未操作日常 Runtime 或 103，不提交/发布其他并行工作。

## Verification

- 回归测试修复前 2 failed/1 passed，修复后与 renderer-workflow/task-runtime/tasks 共 15 项通过；npm run typecheck、build:runtime、vite build 通过。测试最初 .tsx 纳入 renderer 无 Node types，改为 .ts 后类型检查通过，未修改 tsconfig。
- codegraph affected 未关联到既有测试；真实 Safari Alpha 任务详情→Beta 列表正确更新，Tasks 标签保持；继续验证空项目与 watcher。

- 2026-11-19 续做：`npx vitest run tests/project-tasks-switch.test.ts tests/renderer-workflow.test.ts tests/task-runtime.test.ts tests/tasks.test.ts --maxWorkers=1` 4 文件/15 tests 通过；`npm run typecheck`、`npm run build:runtime`、`npx vite build`、`git diff --check` 通过。
- Safari 真实编译 WebUI、三个隔离项目完成上述状态转换并检查最终截图：Beta 选中且只有 Beta watcher updated，Tasks 选中；错误/迟到响应由真实 React 回归覆盖。刷新页面沿用默认 Git 标签，重新打开 Tasks 内容正确，未改变既有刷新语义。
- 隔离 Runtime 16087 已正常 --stop，进程退出及 runtime.lock 释放通过，临时项目/config 已清理。工作区其他 Island 等变更保留，未产生提交；本次修复未包含在已发布的 v0.3.12 或 103 安装包中。

## Notes
- 团队上下文只读；保持现有布局，不改变用户配置和真实项目任务。
