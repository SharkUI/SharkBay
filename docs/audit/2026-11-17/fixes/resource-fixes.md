# 资源与生命周期修复

范围：RL1、RL2、RL4、RL5、RL6、RL7、RL8。基于当前工作区实施，保留同轮其他修复；未修改package、harness、Git、Telegram、应用runtime集成或主审进度台账。本批未提交。

## 变更与证据

| 发现 | 实施 | 回归证据 |
| --- | --- | --- |
| RL1 安装嵌套调度死锁 | 安装占槽任务只执行安装与验证，成功后在槽外刷新machine profile | install-tool新增两个并发fake安装，均成功完成；没有实际CLI发现或安装 |
| RL2 timeout与取消契约 | 到deadline立即reject调用者并记录timeout；保留真实槽直到run settle；stop拒绝queued/后续任务，abort active并等待真实清理 | job-scheduler覆盖忽略signal的迟到成功、槽不提前释放、stop排队/运行/新任务、同步抛错回收 |
| RL2 真实子进程取消 | RunCommandOptions增加signal；profile/安装/扩展agent detector向命令转发；LocalProvider使用共享detached进程组执行器；TERM后必要时2秒KILL，等待child close及终止流程 | process-command创建本轮Node父进程与忽略TERM的后代，取消完成后验证后代PID已消失；LocalProvider测试注入假runner验证信号传递且不会吞abort |
| RL4 信号退出误报成功 | 共享命令执行器仅code===0为成功，保留signal，预取消在spawn之前拒绝 | CodeGraph自发SIGTERM拒绝；预取消+不存在命令返回原取消理由 |
| RL5 删除与维护并发 | 每项目标记removing，先abort并等待维护Promise settle，再uninit；期间拒绝ensure；core在异步路径解析后重新核对enabled | fake同步已收到abort但仍未释放时，不允许uninit；释放后顺序为status/sync/uninit，没有真实索引 |
| RL6 插件配置与缓存 | 稳定cache filename，缓存payload保存启用插件ID/version签名；进程revision隔离在途任务及dedupe，切换后重新读取当前投影 | machine/project热缓存关闭再开启均刷新；旧detector晚到不发布旧投影；新core共享磁盘缓存核对signature；反复切换仍各1个缓存文件 |
| RL7 uname映射错误 | uname -srm输出正确映射system/release/machine | core-detectors完整断言version、kernel、arch；fake命令上下文 |
| RL8 fish PATH丢失 | fish输出改为string join : $PATH，沿用单行解析并忽略前面的启动提示 | fake execFile按fish命令返回对应输出，验证首尾目录全部保留；不运行用户shell |

新增共用实现 `src/main/process-command.ts` 用于CodeGraph和LocalProvider，避免两套不同的终止逻辑。stdout/stderr按字节各限制1MiB，超额取消进程组并拒绝，不再追加空buffer或无界保留输出。未为任意长命令释放“虚假并发槽”。

CodeGraph cancelAllCodeGraphJobs现在返回Promise，等待已记录任务排空；core新增stopJobs入口。ApplicationRuntime.dispose在pending排空之前调用stopJobs的集成由主审负责，本批不修改该文件。进程组行为面向当前macOS/POSIX目标，Windows进程树行为尚未验收。

## 测试隔离与已有用例修正

- CodeGraph管理器测试固定/tmp项目路径改为每用例mkdtemp归属并finally/afterEach清理；fake init后真实exclude写入被限制到本轮临时根。
- InstallTestProvider完整注入machine probe的which/run；安装测试不会运行用户CLI发现或真实安装命令。
- 原profile-orchestrator机器探测用例改为明确fake context，去掉机器预装Codex依赖；项目fixture仍只读取临时文件。
- profile/cache/provider/install选择用例登记临时根并在afterEach清理。没有启动SharkBay、完整ApplicationRuntime、桌面、真实CodeGraph或103。

## 执行结果

Node类型检查：

```text
./node_modules/.bin/tsc -p tsconfig.node.json --noEmit --tsBuildInfoFile /tmp/sharkbay-resource-typecheck.tsbuildinfo
exit 0
```

串行单worker选择验证：

```text
./node_modules/.bin/vitest run tests/job-scheduler.test.ts tests/core-detectors.test.ts tests/command-path.test.ts tests/profile-plugin-state.test.ts tests/profile-orchestrator.test.ts tests/profile-cache.test.ts tests/install-tool.test.ts tests/codegraph-manager.test.ts tests/process-command.test.ts tests/local-provider.test.ts tests/core-runtime.test.ts tests/diagnostics.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism
12 files, 57 tests passed, 3.38 s
```

随后补充project插件缓存切换回归，再执行其所属文件：

```text
./node_modules/.bin/vitest run tests/profile-plugin-state.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism
1 file, 4 tests passed, 0.142 s
```

本批当前选择集合共58个不同测试，不将补跑4个重复计数为61个。增补后Node类型检查再次exit0；git diff --check通过。最初类型检查命令错误地对composite项目禁用incremental，得到TS6379，已改用独立临时tsBuildInfoFile；一次取消消息断言只接受cancelled而Node默认AbortError使用aborted，已修正为同时接受两种明确取消语义并重跑通过。

## 边界与未声称的结果

- 没有运行完整应用停止、真实安装、索引、升级和远程部署验收。
- 对完全忽略signal且永不settle的第三方JavaScript任务，调度器会及时拒绝其调用者，但保留槽且stop等待实际任务；不能在同线程内安全强制杀死任意JS回调。已拥有的外部命令取消可以停止本轮进程组，后续命令会先检查signal。未假装已终止这样的非协作任务。
- 用户shell PATH发现与文件I/O本身不能被当前provider命令signal强制中止；既有PATH子命令有5秒timeout，停止可能等这些已发出的有界工作返回。本批没有将timeout视为JS CPU或全进程RSS限额。
- 缓存仍遵循既有TTL；本批修复配置失效与在途污染，没有实现整个缓存磁盘目录的通用淘汰。缓存签名存在payload中，不因每次toggle创建新文件名。
- 测试证明的是模块级取消、排空与状态契约，不据此给出整应用资源或历史宕机原因结论。
