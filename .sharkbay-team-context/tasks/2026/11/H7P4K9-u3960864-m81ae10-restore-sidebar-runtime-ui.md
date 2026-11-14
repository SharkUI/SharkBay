---
kind: sharkbay_task
taskId: H7P4K9-u3960864-m81ae10
taskTag: H7P4K9
mode: task
title: 恢复 webui-runtime 侧栏入口与渐隐
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1d9cf-7921-7ed0-99b9-953d9df652d5
branch: main
createdAt: 2026-11-14T11:30:41Z
updatedAt: 2026-11-14T11:34:20Z
completedAt: 2026-11-14T11:34:20Z
---

## Summary
已恢复侧栏添加项目与设置按钮、computer 运行时连接状态图标和项目列表渐隐。Web 顶部留白从 30px 收紧至 14px；桌面保留原生目录选择、克隆、咖啡杯及窗口拖拽空间。

## Files
- .sharkbay/tasks/H7P4K9-u3960864-m81ae10-restore-sidebar-runtime-ui.md
- src/renderer/App.tsx
- src/renderer/bridge/runtime-status.tsx
- src/styles/app.css

## Work
- 已读取协议、AGENTS.md 和界面设计技能；当前 main 有其他发布与打包修改，保持不动。
- 参考团队任务 C8T4R9-u3960864-m81ae10 和 9AA0LO-u3960864-m81ae10，保留项目列表菜单不被渐隐裁切的约束。
- 计划：对比原分支定位遗漏 → 最小范围恢复 UI 与交互 → 类型及真实渲染验证。
- 定位：Web 缺少目录选择器导致添加入口隐藏；设置入口缺失；RuntimeStatus 未迁入；渐隐依附于 Web 不展示的咖啡杯栏。恢复原分支 Web 主机添加提示，保留桌面目录选择与拖拽空间。
- 恢复 RuntimeStatus，适配当前 connection() 与 onConnection API；沿用原分支 computer 菜单，未实现的电源和桌面操作保持禁用。
- 底栏统一承载 computer 与桌面咖啡杯；渐隐挂载到项目面板，保持 28px 高度、pointer-events: none 和列表底部滚动余量。
- 完成 React 技能复核及真实 Chrome/Electron 渲染检查；临时脚本、截图均位于 /tmp，测试使用隔离配置和项目，实例已关闭。未创建提交。

## Verification
- `npm run typecheck` 通过。
- `npm run build` 通过；Core 构建检查 RUNTIME_IMPORTS_OK。
- `codegraph affected src/renderer/App.tsx src/renderer/bridge/runtime-status.tsx src/styles/app.css` 未发现关联测试；本次 UI 恢复未新增镜像实现的单元测试。
- 临时脚本 `node /tmp/sharkbay-sidebar-verify.mjs` 通过：真实 Electron 与 Chrome 中检查两个顶部按钮、添加弹窗、Settings/Back、Web 14px/桌面 30px 顶部留白、computer 在线状态及桌面咖啡杯保留。
- 20 个隔离项目验证浅色/深色 CSS 渐隐、28px 高度、鼠标穿透、列表可滚动且最后一项能完整滚到渐隐上方；已人工查看截图。深色检查通过临时切换 DOM 主题属性执行。
- 隔离主机 CLI 添加第 21 个项目，Web 刷新后出现；停止隔离运行时后，两端 computer 均变为 Offline。
- `git diff --check` 通过；保留原有 docs/release.md、package.json、tasks/ 和 tests/runtime-packaging.test.ts 修改。

## Notes
- .sharkbay/team-context/ 只读；不自动提交。
