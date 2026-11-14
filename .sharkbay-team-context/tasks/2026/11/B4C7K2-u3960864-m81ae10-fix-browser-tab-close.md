---
kind: sharkbay_task
taskId: B4C7K2-u3960864-m81ae10
taskTag: B4C7K2
mode: task
title: 修复浏览器标签页无法关闭
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1da13-a6a4-7051-98ef-973107a99a7e
branch: main
createdAt: 2026-11-14T12:41:51Z
updatedAt: 2026-11-14T12:43:43Z
completedAt: 2026-11-14T12:43:43Z
---

## Summary
修复浏览器关闭请求成功后标签仍残留的问题：成功关闭后移除前端标签，并使用已有相邻标签回退逻辑。新增六项针对实际关闭函数的回归测试。

## Files
- src/renderer/App.tsx
- tests/browser-tab-close.test.ts

## Work
- 用 CodeGraph 定位 BrowserManager 关闭逻辑；继续检查渲染层关闭流程及相关历史任务。
- 工作区已有其他未提交修改，保留这些改动，仅追加本任务必要修改。
- 已确认 closeTab 在 closeBrowser 成功后没有调用 removeTab；浏览器没有终端运行时的列表同步机制，导致前端标签残留。
- 补充执行实际关闭处理函数的回归测试，覆盖相邻标签选择和关闭失败。
- closeTab 浏览器分支成功后调用现有 removeTab，保留终端关闭与运行时同步行为。

## Verification
- 待运行针对性回归验证。
- 修复前执行 `npm test -- tests/browser-tab-close.test.ts`：6 项测试中 5 项失败，复现关闭成功后标签残留；错误分支测试通过。
- 修复后执行 `npm test -- tests/browser-tab-close.test.ts tests/browser-tabs.test.ts tests/renderer-workflow.test.ts`：3 个文件、20 项测试全部通过，覆盖活动/非活动/最后一个标签、相邻标签回退、异步完成和错误分支。
- `npm run typecheck` 通过。
- `codegraph affected src/renderer/App.tsx tests/browser-tab-close.test.ts` 定位到新增回归测试。
- `git diff --check -- src/renderer/App.tsx tests/browser-tab-close.test.ts .sharkbay/tasks/B4C7K2-u3960864-m81ae10-fix-browser-tab-close.md` 通过。
- 未在运行中的 Electron 应用实点验证；没有产生提交。

## Notes
- 本任务按 SharkBay 内置浏览器标签关闭异常定位，已通过实际处理函数的回归测试确认缺失的状态更新。
- 参考历史任务 T6R9P4-u3960864-m81ae10（标签恢复）、RV90J9-u3960864-m81ae10（浏览器新窗口）和 B9R4K7-u3960864-m81ae10（浏览器视图边界）。
