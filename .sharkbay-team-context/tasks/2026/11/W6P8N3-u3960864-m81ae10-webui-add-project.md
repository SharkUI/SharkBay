---
kind: sharkbay_task
taskId: W6P8N3-u3960864-m81ae10
taskTag: W6P8N3
mode: task
title: 补齐 WebUI 添加项目流程
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1edf1-0eb3-7c32-ae19-51cc6395dc3f
branch: main
createdAt: 2026-11-18T09:20:08Z
updatedAt: 2026-11-18T09:45:36Z
completedAt: 2026-11-18T09:45:36Z
commits:
  - 6513380852f6239e200b1c847fcbdb637ec2fd7f
---

## Summary
已补齐 WebUI 主机目录添加和仓库克隆，并按用户反馈重排选择器：单行位置导航、独立滚动目录列表、固定取消/确认操作区。类型、构建、行为回归及真实 Chrome 验证通过，已提交 6513380；未更新日常实例或推送。

## Files
- .sharkbay/tasks/W6P8N3-u3960864-m81ae10-webui-add-project.md
- src/shared/application-api.ts
- src/runtime/application-input.ts
- src/runtime/application-runtime.ts
- src/runtime/host-directories.ts
- src/renderer/bridge/web-bridge.ts
- src/renderer/types.ts
- src/renderer/App.tsx
- src/renderer/host-folder-picker.tsx
- src/styles/app.css
- tests/web-runtime-integration.test.ts
- tests/host-folder-picker.test.tsx
- docs/current-facts.md

## Work
- 已读取协议和 AGENTS.md，参考 H7P4K9-u3960864-m81ae10、J9L2VB-u3960864-m81ae10；现有 WebUI 仅展示主机 CLI 提示。
- 采用已有 Local Directory / Remote Repo 模型，Web 选择运行主机目录，桌面保留原生目录选择。
- 计划：核对 Runtime 与桌面接口 → 补齐主机目录浏览、添加和克隆 → 回归测试、类型及真实界面验证。
- 保留已有 docs/current-facts.md、src/runtime/terminal-state.ts、tests/terminal-state.test.ts 修改。
- 将目录注册、克隆提为桌面/Web 共用的受校验应用命令，目录浏览仅列文件夹；Web 弹窗保留原有两项入口，并在同一弹窗选择主机项目目录或克隆父目录。
- 完成 React 技能复核，保留异步目录读取取消保护；路径未确认或加载失败不能添加，执行时锁定导航，返回保留仓库输入；克隆后的 runtime:config 通知发送完整配置而非克隆结果。
- 真实 Chrome 在隔离 profile 和临时 Git 仓库走通添加/克隆；浅色、深色、250%/400% 缩放窄屏检查通过。取消空目录选择后配置仍只有两项，测试标签页已关闭，已请求隔离 Runtime 停止。
- 已确认隔离 Runtime 正常退出，临时目录和状态文件均已清理；docs/current-facts.md 仅更新 Projects and execution 行，保留其他任务的终端行为文档变更。
- 用户指出 Up 等按钮位置临时、缺少 Apple/Google 常见文件选择器语法，重新打开本任务；本次范围仅为既有选择器交互和视觉结构。重新参考语义界面技能、Apple HIG 工具栏/文件管理和 Material Dialog 规范，采用标题区返回、单行位置导航、目录列表与底部固定取消/确认。
- 确定精简后的模型：标题直接显示当前选择任务，取消返回添加方式（与 App 原生选择器取消一致）；Up/Home/路径直达集中在单行工具栏，目录行用文件夹及进入箭头表达导航，固定页脚仅保留取消与确认。加载、空、失败均维持该结构，只有目录区域滚动。
- 按上述结构重排完成；返回、关闭和 Escape 在选择阶段均返回上一选择方式并保留仓库输入。目录切换重置滚动，深色外观使用相同层级；极短视口收紧垂直留白避免底部按钮裁切。
- 用户要求提交；只暂存本任务的功能、UI、测试及 docs/current-facts.md 的项目行，保留其他任务的终端修改。任务文件按仓库现有忽略规则保留本地，不强制纳入代码提交。
- 提交时发现另一任务并发暂存终端修复，待其独立提交 a48bbe9 后核对暂存区只剩本任务；文档仅加入项目行，提交 6513380（12 文件），未混入终端修复。

## Verification
- 新增集成回归在旧实现先失败（主机目录接口不存在），实现后通过：路径含中文/%/空格、符号链接、重复添加、非法路径和克隆失败。
- `npm run typecheck`、Runtime/Vite 构建通过。
- `npx vitest run --config vitest.integration.config.ts`：14 项通过；HostFolderPicker、Web 安全、HTTP 授权和 IPC 合约的 13 项定向测试通过。
- `codegraph affected ...` 未关联测试；手动选取以上相关用例。
- 最终重跑类型检查及上述 27 项测试全部通过，覆盖新增桌面添加/克隆、无会话拒绝、配置通知完整性、目录失败重试及过期响应保护；最终 Vite 构建和 git diff --check 通过。
- 布局调整后的类型检查、Vite 构建和 2 项选择器行为回归通过；待真实渲染复核。
- 布局最终复核：真实 Chrome 完成添加、克隆、重复克隆失败及取消；30 项长目录列表单独滚动且标题/导航/页脚固定，浅色/深色及 250%/400% 缩放窄屏检查通过。400% 初次暴露按钮裁切，修正后完整显示。
- 最终 `npm run typecheck`、2 项选择器行为测试、Vite 构建和 `git diff --check` 通过；本轮只调整 UI，未重复执行上一轮已通过的 Runtime 集成。隔离实例退出，临时目录/状态文件/测试标签页已清理。
- 提交前 `git diff --cached --check` 通过；提交后核对 12 个文件范围、完整提交哈希及 `git status --short`，工作区干净。

## Notes
- 团队上下文只读；未要求提交。
- 运行中的旧 Runtime 不热加载新接口；使用功能需更新运行主机的构建并在适当时机重启 Runtime。本次未操作用户日常实例。
- 布局参考：https://developer.apple.com/design/human-interface-guidelines/toolbars 、https://m1.material.io/components/dialogs.html 。采用导航分组、固定操作区和相邻取消/确认原则；没有引入外部设计系统或宣称平台原生组件一致。
- 用户随后明确授权提交；本任务提交哈希已记录，未推送。
