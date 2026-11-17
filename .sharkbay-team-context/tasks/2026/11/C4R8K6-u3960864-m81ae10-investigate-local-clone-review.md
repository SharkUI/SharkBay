---
kind: sharkbay_task
taskId: C4R8K6-u3960864-m81ae10
taskTag: C4R8K6
mode: task
title: 排查本机有效仓库克隆及 Review 调用失败
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1e76d-6a24-74b3-acf6-ade1b1cdbee0
branch: main
createdAt: 2026-11-17T06:57:44Z
updatedAt: 2026-11-17T07:18:07Z
completedAt: 2026-11-17T07:09:09Z
---

## Summary
确认本机 orca 已完整克隆、登记配置并可由 Runtime 扫描；Git 历史包 2.63 GiB、22,014 commits，总目录约 3.0G。已安装 0.3.6 与当前源码均有 120 秒 RPC 超时且不取消后台操作，符合用户所述界面报错但后台完成的现象；Review 缺少完整错误，尚不能认定同因。

## Files
- .sharkbay/tasks/C4R8K6-u3960864-m81ae10-investigate-local-clone-review.md

## Work
- 用户确认失败发生于本机；新地址 https://github.com/stablyai/orca，与先前截图网站首页错误区别处理，不预判相同原因。
- 已经 CodeGraph 定位 cloneProject、ReviewRunManager、ensureRuntime 和 queueConfig，检索只读团队镜像。克隆与 Review 为独立调用路径，统一 IPC 错误前缀不能说明同因。
- 计划：检查公开仓库可达性与本机 Git → 对比实际 App/Runtime 环境 → 如复现代码问题则最小修复并验证。等待本次完整报错，不猜测参数或权限问题。
- 本机 App 仍为 0.3.6（此前只升级 103），Runtime PID 96645，PATH 为 /usr/bin:/bin:/usr/sbin:/sbin。参考 T2K8M5-u3960864-m81ae10 的 Shell PATH 处理；用临时配置调用已安装版本的 cloneProject 复现，不触碰用户项目列表。
- 读取已安装 cloneProject 与 control-client，克隆通过 execFile 执行完整 git clone；所有控制调用 120,000 ms 后拒绝等待，但没有向 Runtime 发出取消。
- 本机已有 orca 的 origin 与用户地址一致，目录创建至 HEAD 写入间隔约四分钟，Runtime 配置已登记且 projects.scan 能发现。有效仓库本次并非最终克隆失败，界面超时解释与实际状态吻合。
- 独立临时克隆在诊断设定的 120 秒上限内未完成；已结束整个测试进程组并删除自己的临时目录，没有替用户再次克隆或改动已完成仓库。
- 用户进一步询问仓库大小，实测 Git 历史包 2.63 GiB / 1,706,326 packed objects / 22,014 commits；目录约 3.0G，其中 .git 约 2.7G。未修改项目代码或 Git/网络配置。
- 用户随后提供 Review 原始 ENOENT 截图，已由 V4R9P2-u3960864-m81ae10 复现并修复项目 URI 解析错误；Review 该问题不是克隆超时。

## Verification
- GitHub 仓库页面可访问，为公开仓库；本机 git ls-remote https://github.com/stablyai/orca HEAD 成功。
- 实际 Runtime 私有 socket 的 config.get 确认项目已登记，projects.scan 确认可发现该仓库；检查没有修改用户配置。
- git count-objects -vH、git rev-list --count HEAD 与 du -sh 实测历史和目录大小；已安装 control-client.js 与源码 control-client.ts 均确认 120 秒超时逻辑。
- 尚未拿到用户第二次克隆及 Review 的完整错误，因此将超时标为符合证据的原因推断；未宣称 Review 已定位或已修复。没有运行代码测试或发布，因为未改动代码。

## Notes
- 团队上下文只读；不读取令牌或私人终端内容，不停止本机日常 Runtime。
- 诊断不修改用户 Git/网络配置，不把真实仓库自动加入项目。
- 仓库已经存在，后续使用“添加本地项目”或刷新列表即可；不要再次克隆到同名非空目录。若要修复长任务超时，需针对 RuntimeClient 的请求等待/后台状态另行实现与验证。
