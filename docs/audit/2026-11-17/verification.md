# 审计验证记录

审计基线为 `2fc9c935892d04748c01579f819da701eb163150`。固定快照位于 `/tmp/sharkbay-audit-2fc9c93`；原始 279 个受版本控制文件的 SHA-256 见 `baseline.json`。不含工作区未提交的 audit-plan 与文档索引变更。审计过程中只新增报告与证据，产品代码未修复。

## 环境与隔离

使用本机普通 Node（状态复现记录 v24.14.1）、现有 TypeScript 和 Vitest 1.6.1。快照 node_modules 链接至工作区现有依赖，用于只读解析；没有 npm install、依赖升级或运行安装脚本。实际依赖并非本轮重新安装，依赖可重复性以锁文件为依据，不宣称完成干净构建认证。

所有复现均为模块级，数据使用专属临时目录，网络与外部 API 使用替身。安全案例中 Git 仅操作临时仓库并禁用 global/system 配置。没有启动 SharkBay、完整 ApplicationRuntime、HTTP/WS 应用服务、真实 Agent 或 CodeGraph；未更新 103、未操作真实配置或发送消息。

动态检查串行执行；TypeScript 与 Vitest 子进程使用 768 MiB JS 堆预算和外部超时，未做高负载测试。该预算不等于系统级 RSS 配额。资源专项微测最多 8 MiB 合成输入、约 70 MB 单进程峰值和一个测试子进程。证据目录脚本必须按各专项说明运行，不能直接执行整个测试集。

## 已完成检查

| 检查 | 结果 | 证据与范围 |
| --- | --- | --- |
| renderer 类型检查 | exit 0，1.18 秒 | `tsconfig.renderer.json.log`、`typecheck-results.json` |
| node 类型检查 | exit 0，1.05 秒 | `tsconfig.node.json.log`，noEmit，build info 写快照临时文件 |
| runtime 类型检查 | exit 0，0.59 秒 | `tsconfig.runtime.json.log` |
| 筛选模块测试 | 13 文件、104 测试通过，Vitest 总耗时 2.20 秒 | `selected-tests.log`、`selected-tests.json`；不是全量 82 文件 |
| 安全与数据模块反例 | 6 断言，主审重放 exit 0，0.225 秒 | `security-replay.log`；认证设计、内部路径、worktree、任务镜像、Git 文件名 |
| Telegram 状态反例 | 5 断言，主审重放 exit 0，0.206 秒 | `states-replay.log`；全部是假 API 与终端，未处理拒绝案例的独立子进程预期 exit 1 |
| 构建残留反例 | 两次临时 tsc，主审重放 exit 0，0.267 秒 | `build-replay.log`；删除源模块后旧 JS 留存，未构建产品包 |
| 调度与资源反例 | scheduler、usage、signal exit、索引禁用等模块反例 | `resource-lifecycle.md` 和 `evidence/resource/`，包含所用脚本与输出 |
| JSONL 微性能 | 1/8 MiB 合成输入、20 轮 reader 生命周期 | `evidence/resource/results.txt`；微基线有 GC/JIT 噪声，不能推导应用总体性能 |
| 生产导入图 | 130 模块、7 个明确入口，3 个不可达候选 | `source-graph.json`；人工反查动态与外部入口，不能只凭图删除代码 |
| Markdown 相对文件链接 | 未发现缺失文件目标 | `broken-links.json`；不含外链与锚点，也不证明内容正确 |
| npm 批量依赖公告 | 用户授权后查询成功，33包级告警，exit 1为命中状态 | `npm-audit.json`、`npm-audit-query.json`、`dependency-triage.json`；未安装或升级，已区分开发/构建/运行入口 |

类型检查的命令形式是 `node node_modules/typescript/bin/tsc -p <config> --noEmit --tsBuildInfoFile <临时位置>`。Vitest 的具体文件过滤、单 worker 及禁止文件并行参数完整保存在 JSON，不依赖手工重述命令。

## 没有执行的验证

| 验证 | 原因 | 对结论的限制 |
| --- | --- | --- |
| 完整 runtime、桌面和多客户端端到端 | 继续遵守不启动 SharkBay 的约束 | 不确认真实窗口、GPU、PTY 控制权和跨端重连整体通过 |
| 真实大仓库索引与长时间压力 | 需要系统级资源隔离环境 | 没有整应用 CPU/RSS/磁盘规模曲线与长时间无泄漏保证 |
| 新安装包、签名公证及更新 | 当前审计不创建、安装或发布产品包 | 构建规则结论不能代替实际新包完整性与安装验收 |
| 103 部署与远程操作 | 用户明确限制 | 报告不对远程当前状态或事故根因作结论 |
| GitHub、Telegram、Keychain 真实服务 | 避免正式副作用与真实凭据 | 网络容错通过假服务或静态链路验证，未确认所有外部协议兼容 |
| 全部上游公告的独立利用验证和第三方源码逐行审读 | 完成锁文件批量公告查询与重点入口复核，不做攻击验证 | 不提供全依赖无漏洞认证；33包级结果不等于33个产品可利用漏洞 |
| 断电、真实磁盘满和数据库损坏 | 不危及日常环境；部分存储路径仅静态审查 | 持久化设计保护不能替代文件系统故障验收 |

已通过的测试、已复现的反例与仅静态确认的调用链分别标识。报告描述的是该固定源码的工程风险及验证缺口，不判定历史宕机原因，也不代表相关修复已经交付。

主审另在新临时目录重放 resource 的 cases、extra、remove-active、reader，全部 exit 0，结果见 `resource-replay.json`。重放只调整证据脚本中的临时工作路径，不修改被审产品源码。调度两父任务仍无子任务启动，失败批次只写一次、信号退出 resolve、索引卸载与同步重叠等结果均与专项一致。读取器重放数据是总报告采用的数值。
