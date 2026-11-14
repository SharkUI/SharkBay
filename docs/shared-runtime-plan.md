# Electron 与 WebUI 共用 Runtime

## 已确认的产品边界

Electron 与浏览器是同一个工作台的客户端，同一系统用户、同一 profile 只有一个独立 Node runtime。项目、worktree、终端、Agent、任务与 GitHub 协作对象保持同一身份。GitHub 仍是唯一身份与协作来源，不引入云数据库或新的账户体系。

保留 main 的桌面能力（菜单、Island、BrowserView、查找、分享、更新与防休眠）和既有配置；纯 WebUI 检查点中的删除不作为本次功能裁剪依据。桌面原生能力由 Electron 管理，共享业务及所有有状态写入由 runtime 管理。当前安装的旧桌面版不会自动变成共享客户端。

## 基线

- 桌面基线：main `c29334925eb21d72de5b4ac91e25d62933feea72`。
- WebUI 检查点：feature/webui-runtime `f9967728809aa5cb4244165afa3fdf28b4fdf61f`。
- 整合分支：feature/shared-runtime。
- 原 WebUI worktree 保留作参考；main 在完整验收前不更新。

## 实施顺序

1. 迁入 ApplicationRuntime、Core 生命周期、公共契约、HTTP/WS、终端快照与测试；保留桌面配置和服务。验证普通 Node 构建与既有服务回归。
2. 添加 runtime 发现与连接，让 Electron 只连接/按需启动同一个 Node 服务。原生能力继续留在 Electron；验证两次启动复用同一进程且无重复 Hooks/PTY/同步。
3. 接入同一工作台和终端控制规则；关闭任一客户端不停止 runtime，显式停止才统一清理。验证双客户端附着、刷新、接管和授权边界。
4. 回归桌面功能、配置兼容及发布构建；验收通过后提交并合入 main。103 部署独立进行。

## 验证约束

测试使用临时 profile、独立 socket 和 fixture 仓库，不覆盖已安装桌面应用，不修改日常 Agent 全局配置。启动测试不能提交真实模型请求。升级遇到不兼容协议时明确拒绝连接，不能替换正在运行的 runtime 或关闭其中的 Agent。

旧桌面版的全局 Hooks 若仍指向旧 profile，工作台会显示未启用；在新工作台通过现有启用按钮更新一次。启动不会自动覆盖这些配置。之后 Electron 与浏览器使用同一份 runtime Hook 配置。

记录：`.sharkbay/tasks/I8R4N6-u3960864-m464da1-shared-runtime-integration.md`；前置任务 `S6R9W2-u3960864-m464da1`。
