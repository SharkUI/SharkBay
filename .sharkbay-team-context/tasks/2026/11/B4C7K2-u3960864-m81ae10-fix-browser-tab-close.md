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
updatedAt: 2026-11-14T12:55:26Z
completedAt: 2026-11-14T12:55:26Z
commits:
  - 2776244202cd4228a6df5491d10468c77f32100a
---

## Summary
修复浏览器关闭请求成功后标签仍残留的问题，使用已有相邻标签回退逻辑并新增六项回归测试。已提交 2776244，按用户要求与移动适配等本地提交一并推送至 origin/main。

## Files
- src/renderer/App.tsx
- tests/browser-tab-close.test.ts

## Work
- 用 CodeGraph 定位 BrowserManager 关闭逻辑；继续检查渲染层关闭流程及相关历史任务。
- 工作区已有其他未提交修改，保留这些改动，仅追加本任务必要修改。
- 已确认 closeTab 在 closeBrowser 成功后没有调用 removeTab；浏览器没有终端运行时的列表同步机制，导致前端标签残留。
- 补充执行实际关闭处理函数的回归测试，覆盖相邻标签选择和关闭失败。
- closeTab 浏览器分支成功后调用现有 removeTab，保留终端关闭与运行时同步行为。
- 用户授权当前会话将此修复与已提交的移动适配一并交付并 push；接手提交，不修改现有实现，先复跑针对性回归并检查远端分支。
- 已创建提交 2776244202cd4228a6df5491d10468c77f32100a（fix: remove browser tabs after closing），仅包含 App.tsx 修复及六项回归测试，下一步推送 origin/main。
- `git push origin main` 成功，远端由 c293349 快进至 2776244，包含共享运行时、打包、移动适配及本次修复共四个提交。

## Verification
- 修复前执行 `npm test -- tests/browser-tab-close.test.ts`：6 项测试中 5 项失败，复现关闭成功后标签残留；错误分支测试通过。
- 修复后执行 `npm test -- tests/browser-tab-close.test.ts tests/browser-tabs.test.ts tests/renderer-workflow.test.ts`：3 个文件、20 项测试全部通过，覆盖活动/非活动/最后一个标签、相邻标签回退、异步完成和错误分支。
- `npm run typecheck` 通过。
- `codegraph affected src/renderer/App.tsx tests/browser-tab-close.test.ts` 定位到新增回归测试。
- `git diff --check -- src/renderer/App.tsx tests/browser-tab-close.test.ts .sharkbay/tasks/B4C7K2-u3960864-m81ae10-fix-browser-tab-close.md` 通过。
- 未在运行中的 Electron 应用实点验证；关闭处理函数通过针对性回归测试。
- 当前会话复跑 `npx vitest run tests/browser-tab-close.test.ts tests/browser-tabs.test.ts tests/renderer-workflow.test.ts`：20 项通过；提交前 `git diff --cached --check` 通过。
- `git fetch origin` 后 origin/main...HEAD 为 0 落后、3 领先（创建本修复提交前），远端无新改动，可直接快进推送。
- 推送后 `git ls-remote --heads origin main` 确认远端 HEAD 为 2776244202cd4228a6df5491d10468c77f32100a；与本地 HEAD 一致，ahead/behind 为 0/0，工作区干净。

## Notes
- 本任务按 SharkBay 内置浏览器标签关闭异常定位，已通过实际处理函数的回归测试确认缺失的状态更新。
- 参考历史任务 T6R9P4-u3960864-m81ae10（标签恢复）、RV90J9-u3960864-m81ae10（浏览器新窗口）和 B9R4K7-u3960864-m81ae10（浏览器视图边界）。
