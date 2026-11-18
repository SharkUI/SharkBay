# 启动窗口等待修复

用户反馈：测试运行正常，但启动后很久才看到窗口；审计修复前已经存在。只读进程记录显示，2026-11-18 10:34:57 主进程和独立Node进程启动，10:35:12才出现renderer进程。旧日志没有分阶段计时，不能将这约15秒全部归因于某一项。

## 已实施

- Electron ready后立即创建同一个主窗口并载入轻量加载页，后台连接、配置与IPC准备好后再载入工作区。不会先载入需要IPC的React应用而让它因缺少handler失败。
- 主窗口首帧ready即可显示，移除等待初次项目扫描/额外5秒兜底的可见性门槛。原contentReady仅用于记录扫描完成，按窗口与mainFrame归属核对并清理监听。
- 核心服务和Agent运行部件完成必要初始化后，Telegram单独后台初始化。网络慢或Promise失败不会阻止主服务start完成；错误局部记录且不输出异常原文。Telegram本来的连接与重试能力保留。
- Telegram初次配置读取期间若已stop，迟到配置不再启动轮询；用户在后台连接期间退出桌面时，不继续载入工作区，并关闭刚获得的客户端连接。
- 新增startup阶段日志：桌面userData/startup.log，独立Node的阶段写入runtime.log。记录UTC时间、pid、scope、stage、单调时钟耗时及进程uptime，不加入配置、项目路径或凭据。桌面文件追加异步执行，不作为启动前置条件。

上述行为与日志位置已纳入current-facts和development文档。没有声称OS签名校验、Electron自身ready或所有核心初始化已消除耗时，也没有未经实测给出“启动缩短到几秒”。

## 验证

- 默认隔离回归 **91文件655测试全部通过**，没有失败或跳过，结果见[startup-tests.json](startup-tests.json)。
- 新增窗口协调测试使用fake Electron/RuntimeClient；必要服务仍未就绪时已有加载窗口、首帧可显示，同一窗口稍后载入真正界面，退出中不重新加载。
- Runtime测试仅调用真实startup协调方法，Object.create(prototype)装配全fake部件；不调用ApplicationRuntime或其服务构造器，不启动完整runtime、SQL持久库、真实watcher、网络、CLI或索引。阻塞Telegram promise期间核心start依然完成，失败隔离、禁用跳过和Agent先就绪均验证。
- 新增单调时钟日志字段测试及Telegram迟到配置停止回归。聚焦4文件28测试通过。
- 两项mutation验证：临时恢复窗口5秒等待、临时恢复await Telegram初始化，对应行为测试都预期exit1；finally精确恢复源文件后聚焦测试通过，记录见[startup-mutations.json](startup-mutations.json)。
- 三份TypeScript配置检查与纯编译通过；pack也重新完成编译。没有修改已运行实例、配置或远端103，没有提交或发布。

## 本地测试产物

`release/startup-test-20261118110306/mac-arm64/SharkBay.app`，arm64，0.3.10，Electron45.3.3，临时签名。产物严格deep签名校验、随包Node的内存SQLite/PTY模块/WS加载以及修复文件逐字节比对记录在同目录上一层verification.json。未启动该应用、完整runtime或真实PTY。

关闭桌面不停止既有共享后台；单纯替换.app可能继续连接旧后台。本次保持当前实例不动，后续冷启动验收需要显式停止旧后台后再启动新包。真实窗口呈现和实际启动耗时留待用户测试，不由隔离测试冒充。
