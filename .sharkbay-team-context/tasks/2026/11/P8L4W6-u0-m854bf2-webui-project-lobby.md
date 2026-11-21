---
kind: sharkbay_task
taskId: P8L4W6-u0-m854bf2
taskTag: P8L4W6
mode: task
title: 实现 WebUI 项目大厅与工作台导航
status: completed
actor: unknown
githubUserId: 0
machine: 854bf2
agent: Codex GPT-6
sessionId: 01a1fc39-bdd1-7d42-b481-672f4902ff85
branch: linux-webui
createdAt: 2026-11-21T04:37:26Z
updatedAt: 2026-11-21T04:52:12Z
completedAt: 2026-11-21T04:52:12Z
---

## Summary

WebUI 启动先显示项目大厅，项目可添加和移除。进入三栏工作台后可切换同仓库的已登记工作树，返回大厅时保留终端和输入草稿。

## Files

- src/main/config.ts
- src/main/git.ts
- src/main/scanner.ts
- src/renderer/App.tsx
- src/renderer/types.ts
- src/renderer/workflow.ts
- src/runtime/application-input.ts
- src/runtime/application-runtime.ts
- src/shared/types.ts
- src/styles/app.css
- tests/scanner.test.ts

- docs/current-facts.md

## Work

- 沿用已确认的大厅方案和简洁界面要求。参考 W6P8N3-u3960864-m81ae10、W3K8F2-u3960864-m81ae10、M7W2K9-u3960864-m81ae10、T8P4W2-u3960864-m81ae10 与远期设计 Q6M8W4-u0-m854bf2。
- 分组读 Git 仓库身份，不隐式给未登记工作树授权。保留现有创建入口，完整 Git 分支管理留到第二步。

- 已接入 WebUI 大厅、左栏工作树和原有创建流程。按 Git 共享目录归并已登记的工作树，通过一次配置写入移除整组登记。
- 增补真实 Git fixture，覆盖独立 clone、已登记与未登记工作树、普通目录及移除保留文件。

- 保留普通目录项目和独立 clone；每个仓库的最后一次工作树选择保存在当前浏览器。桌面和窄屏的返回入口均位于左上角。
- 根据渲染检查将侧栏工作树行的路径缩短为目录名，完整路径继续显示在工作台。更新当前行为表。

## Verification

- `npm run typecheck`、`git diff --check` 通过，690 项单元测试和 15 项集成测试通过。
- `npm run verify:webui` 通过，包含构建、HTTP、WebSocket、真实 PTY 和关停。
- Chrome 与 Safari 对隔离 Mac Runtime 验证首次打开、桌面和窄视口导航、同仓库分组、目录添加、新建工作树、移除整组登记且保留 Git 目录。确认返回大厅后原 PTY 仍能读回工作树切换前的变量，输入草稿保留。首次打开或刷新先到大厅，重进仓库恢复其上次工作树。
- 隔离 Runtime 与临时测试目录已清理。本轮未部署至 sharkbay-linux，未产生提交。

## Notes

- 开工时 docs/product.md 已存在先前远期设计改动。
