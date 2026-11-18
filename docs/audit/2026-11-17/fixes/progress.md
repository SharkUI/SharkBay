# 审计修复进度

范围是2fc9c93审计台账全部29项。当前工作基于同一提交加修复；历史审计证据保持不变。完成目标需要逐项实施并验证，不能以首批修复代替剩余范围。

继续遵守：不启动SharkBay或完整ApplicationRuntime、不更新103、不运行真实项目索引、不执行正式外部写操作。当前没有用户要求提交、打包或发布，因此只修改工作区并做隔离验证。

## 第一批

已处理UI-06、UI-01、RL3。均先增加复现测试，观察失败后修复，再检查通过。11个文件89个测试通过，三份TypeScript检查通过，diff检查通过；命令、退出码和耗时见[batch-1-verification.json](batch-1-verification.json)，日志在同目录。没有使用“固定源代码字符串存在”代替本批后端行为验证。

UI-06通过已有write命令的显式create模式区分创建与保存，使用真正的文件/目录创建，不以.gitkeep模拟目录。RL3的失败批次保留上限与读取器重试共同实施，避免修复丢批后反而引入无界队列；进程退出时仍可能因持久存储不可用而失败并上报，不声称无法写入时能保证持久化成功。

这些结论只覆盖模块级验证；完整客户端、服务与安装包验收仍未执行。后续改动触及相同路径时继续回归，不标记整轮修复完成。

## 第二批

已处理SD2、SD3。受管理路径逐段拒绝既有符号链接；写入使用O_NOFOLLOW并通过同一文件句柄检查类型、截断与chmod，拒绝多硬链接文件。taskId在解析和分配输出前校验；协议、产物和镜像写入复用边界。校验与打开之间的叶子符号链接替换已有回归；对其他进程并发替换祖先目录，普通路径API不提供整个操作的文件系统事务保证，不能声称所有TOCTOU已经消失。

Git元数据由Git解析，兼容.git为文件的linked worktree；同步使用独立临时index，finally清理。普通与linked worktree的安装/更新/本地bare远端同步/卸载均验证用户index字节及暂存内容保持。最终16文件150测试、三份类型检查与diff检查通过，见[batch-2-verification.json](batch-2-verification.json)。仅在本轮临时目录内操作Git，没有外部远端或应用启动。

## 逐项状态

| 编号 | 级别 | 问题 | 当前状态 | 本批改动/后续工作 |
| --- | --- | --- | --- | --- |
| SD1 | P1 | 服务对私有网络地址免认证且访问不可撤销 | 代码修复与隔离验证通过 | 所有网络均需一次性grant/cookie；HTTP/WS执行前复查，撤销全部连接，临时fake runtime服务验证慢body及在途terminal请求撤销。 |
| SD2 | P1 | 协议及产物内部写入未应用项目边界，符号链接与 taskId 均可越界 | 本批代码与模块回归通过 | 受管理路径与taskId边界、O_NOFOLLOW句柄写入；harness-boundaries.test.ts包含23项回归，普通路径祖先替换竞态限制见第二批说明。 |
| SD3 | P2 | linked worktree 的 `.git` 被错误当作目录，协议安装与同步失败 | 本批代码与模块回归通过 | Git原生解析exclude；独立临时index与清理；worktree-protocol.test.ts验证普通/linked全流程及用户暂存区。 |
| SD4 | P2 | 远端任务删除不会从本地镜像移除 | 代码修复与隔离验证通过 | 镜像完整staging+失败回滚，远端空树/删除/重命名清除旧镜像，watch稳定父目录；本地已完成任务重新发布规则保持，非远端墓碑策略。 |
| SD5 | P2 | Git porcelain 的非 ASCII 路径未正确解码 | 代码修复与隔离验证通过 | Git porcelain -z记录，不剥文件名空白，正确消费rename/copy源路径；真实临时Git验证中文、引号、反斜线、换行、tab和空白。 |
| RL1 | P1 | 两个并发安装可永久占满调度器并阻塞正常停止 | 代码修复与隔离验证通过 | 安装后的刷新在调度槽之外；停止先拒绝队列、取消运行并排空；见resource-fixes.md。 |
| RL2 | P2 | 调度器 timeout 不形成可靠的截止契约 | 代码修复与隔离验证通过 | deadline及时拒绝调用者、保留槽至工作实际settle；provider取消传播；见resource-fixes.md。 |
| RL3 | P2 | 用量批写失败会丢掉待重试事件 并可能使后台 timer 抛出未处理异常 | 本批代码与模块回归通过 | 事务成功后移除批次，失败5秒定时重试；队列最多50条，满队列读取施加背压，watcher失败行按字节偏移重读；dispose取消重试。 回归：tests/token-usage-collector.test.ts、tests/agent-session-reader.test.ts。 |
| RL4 | P2 | CodeGraph 进程被信号终止被当成正常成功 | 代码修复与隔离验证通过 | 信号终止报错，共用命令runner取消进程组并等待退出；见resource-fixes.md。 |
| RL5 | P2 | 禁用索引插件时未取消正在维护的索引 而是并发执行卸载 | 代码修复与隔离验证通过 | 禁用先拒绝新维护，取消并等待已运行维护后卸载；见resource-fixes.md。 |
| RL6 | P2 | 插件启停没有使已缓存 profile 失效 | 代码修复与隔离验证通过 | 缓存payload保存插件签名，在途结果检查revision，磁盘key稳定；见resource-fixes.md。 |
| RL7 | P2 | 机器探测交换了架构和内核版本 | 代码修复与隔离验证通过 | 架构/内核字段映射纠正，fake机器字段回归；见resource-fixes.md。 |
| RL8 | P2 | fish 的 PATH 按行输出却只保留最后一行 | 代码修复与隔离验证通过 | fish PATH以冒号连接，fake shell输出保留所有路径；见resource-fixes.md。 |
| UI-01 | P1 | Telegram 附属网络请求失败会成为未处理 Promise 拒绝 | 本批代码与模块回归通过 | typing/edit/delete/approval/finalize后台异常局部捕获；失败收尾清理且不清除更新turn；日志不包含异常原文或凭据。 回归：tests/telegram-background-errors.test.ts。 |
| UI-02 | P1 | 审批按钮缺少请求身份 可向另一会话误发送确认 | 代码修复与隔离验证通过 | 审批绑定用户/chat/message/PTY/turn/token，await前消费；见telegram-fixes.md。 |
| UI-03 | P2 | 会话列表的选择上下文跨用户共享 | 代码修复与隔离验证通过 | 列表按用户+消息归属，拒绝旧/跨用户选择；见telegram-fixes.md。 |
| UI-04 | P2 | 停用并未阻止在途轮询结果执行 | 代码修复与隔离验证通过 | singleflight、代际检查、AbortSignal及token切换offset；见telegram-fixes.md。 |
| UI-05 | P2 | 多用户绑定同一 PTY 时路由被覆盖且可被另一用户清除 | 代码修复与隔离验证通过 | Telegram用户间独占接管与迟到detach保护；见telegram-fixes.md。 |
| UI-06 | P1 | 新建同名文件会清空现有文件 | 本批代码与模块回归通过 | 创建file使用wx，目录使用非递归目标mkdir；共享输入校验create模式，同名返回already-exists；普通保存不变。 回归：tests/file-boundaries.test.ts。 |
| UI-07 | P2 | Telegram 只截断显示结果 未限制原始 PTY 缓冲 | 代码修复与隔离验证通过 | 原始输出最多64KiB UTF8尾部，transcript支持者不存raw TUI；见telegram-fixes.md。 |
| UI-08 | P3 | Telegram Turn 存在仅测试可达的结束机制与陈旧模型说明 | 代码修复与隔离验证通过 | 移除无生产输入源的turnEnd/silence/settling与专属测试；见telegram-fixes.md。 |
| QB-01 | P1 | Electron 发布基线长期脱离上游支持 | 代码修复与隔离验证通过 | Electron锁定45.3.3，受支持声明/类型/模块/编译通过；桌面二进制安装、启动及打包验收未执行；见dependency-build-fixes.md。 |
| QB-02 | P3 | 已安装插件机制没有生产入口 | 代码修复与隔离验证通过 | 删除未接通的installed-plugins/plugin-manifest及专属测试，保留bundled；见code-docs-fixes.md。 |
| QB-03 | P3 | 空定价模块失去用途 | 代码修复与隔离验证通过 | 删除空定价模块，无生产用途或剩余引用；现有用量回归保持；见code-docs-fixes.md。 |
| QB-04 | P2 | 新旧产品文档混合而缺少统一事实表 | 代码修复与隔离验证通过 | current-facts统一事实入口，9份说明/提案纠偏，Node要求与测试说明同步；见code-docs-fixes.md。 |
| QB-05 | P2 | 测试环境依赖和清理职责存在缺口 | 代码修复与隔离验证通过 | 临时目录afterEach释放、timer flush、假机器provider、host与完整runtime测试opt-in、真实SQLite约束回归；见test-quality-fixes.md。 |
| QB-06 | P2 | CodeGraph 手动边界测试只检查特定写法 | 代码修复与隔离验证通过 | 提取真实CodeGraphPanel并React挂载验证手动触发、切换、失败/重试与迟到结果；见test-quality-fixes.md。 |
| QB-07 | P2 | 桌面构建输出未清理 可能将删除的模块继续打包 | 代码修复与隔离验证通过 | desktop编译先清dist-electron，双次临时构建验证删除源文件不残留；见dependency-build-fixes.md。 |
| QB-08 | P2 | 开发与运行依赖存在未处置的公告版本命中 | 代码修复与隔离验证通过 | 直接/传递依赖升级，限定minimatch覆盖且真实matcher/parser验证；npm官方复查0告警；见dependency-build-fixes.md。 |

当前进度：29项均已实施代码/文档修复并通过本轮隔离验证。该状态不包括尚未授权执行的桌面启动、完整runtime、真实索引、安装包、签名/升级或103验收，不据此判定历史整机卡顿原因。

## 最终整合

调度/资源、Telegram、Git与授权、代码/文档清理、测试质量及依赖构建均整合到同一工作区。最终默认隔离回归为89文件647测试全部通过（无失败/跳过），三份类型检查与纯编译build通过，npm官方复查0告警。完整默认隔离测试、类型检查、纯编译构建与依赖审查结果见[final-verification.json](final-verification.json)。原审计报告仍描述固定目标提交，不用修复后的结果改写历史结论。变更未提交、打包或发布。

分项说明：[Git与授权](git-auth-fixes.md)、[资源生命周期](resource-fixes.md)、[Telegram](telegram-fixes.md)、[代码与文档](code-docs-fixes.md)、[测试质量](test-quality-fixes.md)、[依赖与构建](dependency-build-fixes.md)。
