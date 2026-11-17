---
kind: sharkbay_task
taskId: P7W4K2-u3960864-m81ae10
taskTag: P7W4K2
mode: quick
title: 固定 WebUI 默认端口为 17777
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T03:35:17Z
updatedAt: 2026-11-17T04:01:55Z
commits:
  - fab4ada07fabab0d165957957be64f544151dabc
completedAt: 2026-11-17T03:36:31Z
---

## Summary
已将独立 WebUI 与 App 自动启动 Runtime 的默认端口统一为 17777，保留已有显式覆盖能力。类型检查、构建和默认固定端口的隔离集成验证通过，已随 v0.3.7 发布准备提交 fab4ada。

## Files
- src/server/main.ts
- electron/runtime-client.ts
- .sharkbay/tasks/P7W4K2-u3960864-m81ae10-fixed-webui-port.md

## Work
- CodeGraph 定位两处启动入口；计划修改默认值及帮助文案，完成类型检查与针对性验证。
- 已检索团队上下文，参考 D8P4K7-u3960864-m81ae10：5184 属于 Vite 开发页面端口，本次只修改 WebUI Runtime 端口。
- 已将独立入口默认值与 App 的环境变量回退值改为 17777，并更新帮助文案；保留 --port 与 SHARKBAY_RUNTIME_PORT 覆盖能力。
- 使用现有 WebUI 验证脚本的内存变体去掉 --port 0，实际验证默认 17777；临时配置、PTY 和进程均已清理，未修改验证脚本。
- 用户授权发布后，与 LAN 支持一起提交为 fab4ada；发布和远端安装进展见 R7N4V9-u3960864-m81ae10。

## Verification
- `npm run typecheck`、`npm run build:runtime`、`git diff --check` 均通过。
- 隔离集成验证通过：默认监听 17777，静态页面、授权、WebSocket、真实 PTY 与退出清理均正常；另一个独立配置的 Runtime 占用相同端口时得到 EADDRINUSE，没有随机端口回退。
- 首次冲突验证误共用配置，被现有 profile lock 提前拦截；改为两个独立配置后重跑通过，无业务代码变更。
- App 自动启动入口通过代码核查与类型检查；本次未启动或重新打包 Electron 应用，未重启用户 Runtime。

## Notes
- 保留已有 src/styles/app.css 未提交修改；不启动局域网访问或代理实现。
- 已运行的 Runtime 会被复用，默认端口变更在新启动 Runtime 时生效。
