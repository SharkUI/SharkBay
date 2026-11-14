---
kind: sharkbay_task
taskId: M6R8T2-u3960864-m81ae10
taskTag: M6R8T2
mode: task
title: 排查 WebUI 与 App harness 更新提示不一致
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1d9cf-7921-7ed0-99b9-953d9df652d5
branch: main
createdAt: 2026-11-14T11:52:55Z
updatedAt: 2026-11-14T11:54:36Z
completedAt: 2026-11-14T11:54:36Z
---

## Summary
现场确认两端共用同一 Runtime，差异来自选中项目不同：App 为 SharkBay，WebUI 为 baobao。同一项目的更新提示一致，无需修改业务代码。

## Files
- .sharkbay/tasks/M6R8T2-u3960864-m81ae10-harness-status-parity.md

## Work
- 已通过 CodeGraph 定位 harness 状态比较、运行时及更新入口；先核对真实运行实例、项目路径和两端状态，再决定修复范围。
- 保留侧栏任务 H7P4K9-u3960864-m81ae10 及其他发布打包修改；参考 W7P4N2-u3960864-m81ae10-package-webui-test，存在独立测试应用包。
- 读取两端真实 UI：App 当前为 SharkBay，WebUI 为 baobao；核对 WebUI 地址与本地 Runtime hello 返回 origin 一致，当前仅一个相关运行时进程。
- WebUI 切换 SharkBay 后无更新提示；App 切换 baobao 后出现与 WebUI 一致的 4 文件更新提示。未点击安装或更新、未停止用户进程、未创建提交。

## Verification
- 通过本地控制 socket 读取 protocol.getStatus：SharkBay 为 required=false/files=[]；baobao 为 required=true，4 个文件需更新。
- 真实 UI 验证：WebUI 的 SharkBay 无提示，App 的 baobao 展示 Update Harness；4 个文件均为 protocol.md、open-artifact.sh、artifact.sh、review.sh。
- App 的 TasksDetailTab 与 WebUI 使用同一显示条件 status.installed && status.harnessUpdate.required，均经 ApplicationRuntime/task-runtime 查询同一 harness 比较实现。
- 仅新增诊断任务记录，未修改业务代码，因此未运行构建或测试。

## Notes
- 不停止用户运行时、不更新当前项目 harness，先保留不一致现场。
- 两端选中项目分别存于各自前端状态，不会自动同步；比较更新提示时应核对项目完整路径。
