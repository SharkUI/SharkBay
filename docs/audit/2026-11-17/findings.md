# 审计发现台账

本表记录目标提交的审计发现；后续工作区修复状态见[修复进度](fixes/progress.md)。

基线 `2fc9c935892d04748c01579f819da701eb163150`。每项详细调用链、位置、触发、影响、证据、保护条件与建议见对应专项的同编号章节。所有发现均尚未修复。P1 包含安全设计与上游支持风险，不等于已发生利用。

共 29 项主台账：P1 7 项、P2 19 项、P3 3 项；未确认 P0。测试专题 TQ 按共性组织，与 QB-05/QB-06 和各缺陷验证缺口交叉，不再次累加为独立缺陷数量。依赖查询的33个包级告警合并为QB-08整改主题，Electron沿用QB-01，不重复记为33个产品漏洞。

| 编号 | 等级 | 发现 | 详细证据 |
| --- | --- | --- | --- |
| SD1 | P1 | 服务对私有网络地址免认证且访问不可撤销 | [security-data.md](security-data.md) |
| SD2 | P1 | 协议及产物内部写入未应用项目边界，符号链接与 taskId 均可越界 | [security-data.md](security-data.md) |
| SD3 | P2 | linked worktree 的 `.git` 被错误当作目录，协议安装与同步失败 | [security-data.md](security-data.md) |
| SD4 | P2 | 远端任务删除不会从本地镜像移除 | [security-data.md](security-data.md) |
| SD5 | P2 | Git porcelain 的非 ASCII 路径未正确解码 | [security-data.md](security-data.md) |
| RL1 | P1 | 两个并发安装可永久占满调度器并阻塞正常停止 | [resource-lifecycle.md](resource-lifecycle.md) |
| RL2 | P2 | 调度器 timeout 不形成可靠的截止契约 | [resource-lifecycle.md](resource-lifecycle.md) |
| RL3 | P2 | 用量批写失败会丢掉待重试事件 并可能使后台 timer 抛出未处理异常 | [resource-lifecycle.md](resource-lifecycle.md) |
| RL4 | P2 | CodeGraph 进程被信号终止被当成正常成功 | [resource-lifecycle.md](resource-lifecycle.md) |
| RL5 | P2 | 禁用索引插件时未取消正在维护的索引 而是并发执行卸载 | [resource-lifecycle.md](resource-lifecycle.md) |
| RL6 | P2 | 插件启停没有使已缓存 profile 失效 | [resource-lifecycle.md](resource-lifecycle.md) |
| RL7 | P2 | 机器探测交换了架构和内核版本 | [resource-lifecycle.md](resource-lifecycle.md) |
| RL8 | P2 | fish 的 PATH 按行输出却只保留最后一行 | [resource-lifecycle.md](resource-lifecycle.md) |
| UI-01 | P1 | Telegram 附属网络请求失败会成为未处理 Promise 拒绝 | [states-ui.md](states-ui.md) |
| UI-02 | P1 | 审批按钮缺少请求身份 可向另一会话误发送确认 | [states-ui.md](states-ui.md) |
| UI-03 | P2 | 会话列表的选择上下文跨用户共享 | [states-ui.md](states-ui.md) |
| UI-04 | P2 | 停用并未阻止在途轮询结果执行 | [states-ui.md](states-ui.md) |
| UI-05 | P2 | 多用户绑定同一 PTY 时路由被覆盖且可被另一用户清除 | [states-ui.md](states-ui.md) |
| UI-06 | P1 | 新建同名文件会清空现有文件 | [states-ui.md](states-ui.md) |
| UI-07 | P2 | Telegram 只截断显示结果 未限制原始 PTY 缓冲 | [states-ui.md](states-ui.md) |
| UI-08 | P3 | Telegram Turn 存在仅测试可达的结束机制与陈旧模型说明 | [states-ui.md](states-ui.md) |
| QB-01 | P1 | Electron 发布基线长期脱离上游支持 | [quality-build-docs.md](quality-build-docs.md) |
| QB-02 | P3 | 已安装插件机制没有生产入口 | [quality-build-docs.md](quality-build-docs.md) |
| QB-03 | P3 | 空定价模块失去用途 | [quality-build-docs.md](quality-build-docs.md) |
| QB-04 | P2 | 新旧产品文档混合而缺少统一事实表 | [quality-build-docs.md](quality-build-docs.md) |
| QB-05 | P2 | 测试环境依赖和清理职责存在缺口 | [quality-build-docs.md](quality-build-docs.md) |
| QB-06 | P2 | CodeGraph 手动边界测试只检查特定写法 | [quality-build-docs.md](quality-build-docs.md) |
| QB-07 | P2 | 桌面构建输出未清理 可能将删除的模块继续打包 | [quality-build-docs.md](quality-build-docs.md) |
| QB-08 | P2 | 开发与运行依赖存在未处置的公告版本命中 | [quality-build-docs.md](quality-build-docs.md)、[依赖分诊](dependencies.md) |

## 跟踪字段与关闭条件

处理状态均为待处理；责任待后续实施安排。修复前先将同编号转换为独立任务，附最小变更、兼容影响和具体回归。验证通过才能改为已验证；接受设计风险需记录明确决策。RL1/RL2 共享取消与嵌套调度根因，建议同批修复，但两种可独立触发的契约错误分别保留。

## 加固机会与待确认项

源码中发现的 Keychain 进程参数暴露面、Electron 信任来源、文件系统校验后路径竞争、renderer 旧快照竞争、长期缓存保留与类型镜像维护均记录在专项限制或改进章节，未作为已确认利用漏洞计数。读过没有发现问题的模块也在覆盖表记录，不以问题数量衡量审计质量。
