# 安全与数据完整性审计

审计对象：`2fc9c935892d04748c01579f819da701eb163150`。输入为 `/tmp/sharkbay-audit-2fc9c93` 固定源码快照，未修改产品代码。

本分项覆盖计划 4.4–4.7，并交叉检查协议、浏览器与持久化边界。结论来自静态调用链和模块级隔离复现；没有启动完整 ApplicationRuntime、Electron 或 HTTP/WS 服务，没有联网、发送消息、更新 103 或接触真实用户配置。

## 结论

确认 5 项问题，其中 2 项 P1、3 项 P2；内部写入越界包含两种独立触发方式。未发现能够据本分项证据判为 P0 的问题。本文的严重程度是代码审计判断，不代表已经发生真实利用或数据损失。

| 编号 | 问题 | 等级 | 证据 |
| --- | --- | --- | --- |
| SD1 | 服务对私有网络地址免认证且访问不可撤销 | P1 | 模块复现与静态调用链；属于显式设计风险 |
| SD2 | 协议及产物内部写入未应用项目边界，符号链接与 taskId 均可越界 | P1 | 两种模块复现 |
| SD3 | linked worktree 的 `.git` 被错误当作目录，协议安装与同步失败 | P2 | 本地临时 linked worktree 复现 |
| SD4 | 远端任务删除不会从本地镜像移除 | P2 | 模拟 Git 结果的模块复现 |
| SD5 | Git porcelain 的非 ASCII 路径未正确解码 | P2 | 真实临时 Git 仓库输出与解析复现 |

## SD1 私有地址作为全权限身份

- **位置**：`src/server/session-auth.ts:5–13,41–48`；`src/server/http-server.ts:68–90,145–178,196,204`；`src/runtime/application-runtime.ts:64–78`。
- **入口与条件**：runtime 的 HTTP 服务绑定 `0.0.0.0`；来自 RFC1918、link-local 或 loopback 的请求，无须 grant/cookie 即获得统一 `lan` 身份。能连接该端口的局域网设备可以建立 WS、取得自己的 clientId，并使用正常 Host/Origin/header 调用允许的命令。
- **影响**：可读取已配置项目文件、修改或删除文件、创建终端并执行命令；终端控制权校验不阻止客户端创建自己的终端。撤销清空的是 grants/sessions，LAN 路径在校验前直接返回，服务器也明确不关闭 LAN 连接，因此重新连接和继续使用仍有效。
- **证据**：`new SessionAuth().authenticate(undefined,'10.0.0.42')` 返回 `lan`；调用 `revokeAll()` 后结果不变。服务绑定、命令与 WS 路径为静态确认，未运行真实网络攻击。
- **产品意图与误报排除**：`tests/web-runtime-security.test.ts:10–14` 明确要求 LAN 无 cookie 可用，所以这不是未按当前测试实现的偶然绕过，而是将网络位置等同于信任的安全设计风险。Host/Origin 与 CSRF 检查能阻挡部分恶意网页跨站访问，但独立 LAN 客户端可设置合法 header，不能作为身份认证。最终设计需明确是否允许整段局域网拥有宿主用户权限。
- **最小改进**：默认仅监听 loopback，显式开启远程访问后仍要求可撤销、独立会话授权；不要自动信任整个私网。保留必要的 Host/Origin 与客户端控制校验。
- **验收**：未知 LAN 客户端无法连接或执行命令；有效授权可访问，撤销后 HTTP/WS 同时失效且不能无凭据重连；正常桌面与授权浏览器操作仍有效。

## SD2 内部协议和产物写入可以越出项目

- **位置**：`src/main/harness.ts:334–349,398–413,493–505`；`src/main/tasks.ts:24–31`；`src/runtime/task-runtime.ts:54–75,115–121`；`src/runtime/application-runtime.ts:84–103`。
- **触发 A 符号链接**：配置项目内预置 `.sharkbay` 或下层目录/文件符号链接，执行协议安装或更新。`writeManagedHarnessFiles` 使用 join/mkdir/writeFile/chmod，未 realpath 校验或拒绝链接，导致写入项目外的链接目标。
- **触发 B taskId**：任务 frontmatter 只要求非空 `taskId` 和 `title`。产物与 review 文件名取 `taskId.split('-')[0]` 直接拼接；包含 `../` 的合法已加载任务可经 `artifacts.start` 到达 `reserveArtifactPath`，在仓库外创建随机命名文件。review 分配存在相同构造。
- **影响**：A 能覆盖或改变项目外同名文件及脚本权限；B 能在仓库外创建文件并向后续 Agent 传递越界路径。正常项目根校验不能防止内部子路径的这两种逃逸。
- **复现**：临时仓库 `.sharkbay -> ../outside` 后调用 `installHarness`，确认 `outside/harness/protocol.md`、脚本和 machine-id 被创建。独立正常临时仓库调用 `reserveArtifactPath(repo,'../../../outside/task')`，确认生成路径位于 `outside`。
- **误报排除**：B 使用 `wx`，所以证明的是越界创建，不是直接覆盖任意现有文件；随机后缀也限制精确命名。A 则使用普通覆盖写入。复现没有真实用户文件参与。
- **最小改进**：对受管理目录和最终文件采用统一且拒绝越界链接的解析/创建策略；在任务入口校验 taskId/tag 格式，分配文件名前再次限制为安全标识符；操作失败前不要留下部分外部写入。
- **验收**：`.sharkbay`、harness、产物目录与文件链接到外部均拒绝；含 `/`、`..`、绝对路径等 taskId 不创建文件；合法任务仍可安装协议与生成产物。补充竞态测试，明确单次 realpath 后路径可变的边界。

## SD3 Git 工作目录布局不兼容 linked worktree

- **位置**：`src/main/harness.ts:523–530,603–604,616,699–701`；`src/main/teamwork-sync.ts:88–89,242–244`。
- **入口与条件**：通过项目现有 worktree 功能创建或手工添加 linked worktree，安装/更新 Task Protocol 或创建/推送上下文分支。linked worktree 的 `.git` 是指向 Git 管理目录的文本文件。
- **影响**：`ensureLocalExclude` 对 `<worktree>/.git/info` mkdir 抛 `ENOTDIR`，而此前已经写入 `.sharkbay`，形成“安装失败但 isHarnessInstalled 为真”的部分状态。同步的临时 index 同样使用 `.git/tmp-*`，即使解决 exclude 问题也仍不能正确同步。
- **复现**：仅在临时 Git 仓库创建一个 empty commit 和 linked worktree，调用 `installHarness`，断言 `ENOTDIR` 且 `protocol.md` 已存在。
- **误报排除**：普通 clone 的 `.git` 目录可正常工作；问题限定于 Git 合法的 gitfile 布局。没有破坏原 Git index 的证据，不将安装失败扩大解释为 Git 数据损坏。
- **最小改进**：通过 `git rev-parse --git-path` 等 Git 原生解析定位 exclude/index，明确 shared 与 per-worktree 文件语义；临时 index 用独立安全临时文件，失败回滚或准确表示部分安装。
- **验收**：普通仓库、linked worktree 与 gitfile 布局安装/更新/卸载、首次同步和后续推送均成功；用户 index/ignore 内容不被覆盖。

## SD4 远端删除后镜像仍保留陈旧任务

- **位置**：`src/main/teamwork-sync.ts:164–175`；`src/main/tasks.ts:63–92`。
- **入口与条件**：任务曾成功镜像，之后从远端上下文分支删除或重命名，下一次同步取得新的远端列表。
- **影响**：刷新仅写远端当前文件，不清理已消失的旧文件；`scanTasks` 继续读取本地 team-context，长期显示远端已删除任务。重命名、taskId 变更时也可能保留旧副本。这与“镜像是可重建投影”的数据职责不一致。
- **复现**：实际调用 `refreshMirrorFromRemote`，仅替换 Git I/O 返回值：首次返回一个任务，第二次成功返回空列表，旧文件仍存在。没有网络或 Git 写操作。
- **误报排除**：不建议在任何空列表上直接删除：现有 `listRemoteFiles` 也把 Git 失败转为空数组。修复必须区分“成功取得空树”和“无法读取远端”，避免把数据过期修成失败时清空镜像。
- **最小改进**：成功完整读取后，以暂存目录或清单原子替换受管理镜像；远端读取失败时保留旧镜像并显式标记 stale/error。
- **验收**：远端删除与重命名反映到镜像；失败与中途写入不损坏上次完整快照；本地未同步任务不被删除。

## SD5 Git 特殊文件名解析失真

- **位置**：`src/main/git.ts:60–64,66–84,95–101`；消费者 `src/core/core-service.ts:234`、`src/renderer/App.tsx:4291–4292`。
- **入口与条件**：默认 `core.quotePath=true` 的 Git 仓库包含中文等非 ASCII 文件名；porcelain 文本产生 C 风格 UTF-8 八进制转义。换行、tab 或包含 ` -> ` 的名字也是同类脆弱边界。
- **影响**：当前 unquote 只处理双引号和反斜杠，未解码八进制和控制字符，dirtyFiles 键不等于真实相对路径；任务文件关联、脏状态标记及后续路径操作可能找不到文件。
- **复现**：临时仓库写入 `中文文件.md`，运行 Git porcelain 并调用真实 `parseGitDirtyFiles`，断言解析结果不是该文件名。
- **误报排除**：用户关闭 quotePath 时普通中文名可能正常；这不是源码内容丢失的证明。报告仅确认路径识别错误。
- **最小改进**：采用 `git status --porcelain=v1 -z` 并按 NUL 与 rename 双路径规则解析，避免手写不完整的 C 字符串解码。
- **验收**：中文、空格、引号、反斜杠、换行、tab、字面 ` -> `、rename/copy 的真实临时 Git 测试，结果精确匹配文件路径。

## 覆盖与已有防护

| 模块/边界 | 已检查内容与结论 |
| --- | --- |
| session-auth/http-server | grant 随机数、单次交换、TTL、限流、cookie、Host/Origin、WS、请求去重、body/消息与发送队列边界；确认 SD1。静态服务 realpath/类型/根边界与预览 CSP 有明确防护 |
| application-runtime/application-input | 公共方法 allowlist、字段拒绝、终端尺寸、service 对象、配置队列、local-only 命令；未发现直接通过 method 调用内部原型方法或 HTTP config.addProject 的路径 |
| control-server/control-client | socket 目录 ownership/权限、握手、消息和发送队列；可访问 owner-only socket 的同一 OS 用户具有高权限是现有设计前提 |
| path-safety/project-files/file-content/project-uri | 真实路径根包含、非法相对路径、叶子符号链接、目录解析、5MiB 文件限制、改名拒绝已存在目标；已有用户文件 API 防护未被 harness 复用。文件改名与读写仍有校验后路径变化的竞态残余，未动态证明利用，不单列已确认漏洞 |
| worktree/project-clone/git/github | 参数数组执行、Git 命令超时/缓冲、路径及 branch/remote 输入、元数据与 dirty path；确认 SD3/SD5。没有把 execFile 本身误报成 shell 注入 |
| harness/task-runtime/tasks/teamwork-sync | 安装/更新/卸载、exclude、身份/owner cleanup、任务合并、临时 index、镜像更新、push 重试；确认 SD2/SD3/SD4 |
| json-file/config/token-usage-db | 原子 JSON 临时文件 O_EXCL/0600、fsync/rename、配置迁移与单写入队列、SQLite WAL/事务/参数化 SQL；未执行真实配置迁移或打开用户数据库 |
| secrets | Keychain 存储、异常处理；set 把秘密作为 security CLI 参数传入，存在同机进程观测暴露面，作为加固机会而非已证明泄露事件 |
| browser-tabs/electron main/ipc/preload | BrowserView contextIsolation/nodeIntegration/sandbox、file URL、证书例外、新窗口及 shell.openExternal；主窗口 sandbox=false、IPC senderFrame 检查不足以表达可信来源、外部 scheme 未白名单是待加强边界，未找到可复现的独立远程提权链，未作为确认利用漏洞计数 |
| review-control-server/share-artifact | socket 0600、请求大小、产物 HTML 上传路径/大小与身份来源；共享 API 服务端不在当前代码范围，无法证明其用户身份校验。前端 repoRoot 字符串识别不替代真实路径校验，列为加固项 |

与其他分项交叉确认：Files 面板“新建文件”复用覆盖式 `projects.writeFile`，同名会清空旧内容；由界面与状态审计分项记录，不在这里重复计数。

## 可重放验证

脚本：[evidence/security-repro.cjs](evidence/security-repro.cjs)。在主仓库执行：

```sh
node docs/audit/2026-11-17/evidence/security-repro.cjs /tmp/sharkbay-audit-2fc9c93
```

脚本读取固定源码，以仓库现有 TypeScript 只做语法转译到临时目录；仅导入没有启动副作用的 harness、command-path、session-auth、application-api、teamwork-sync 和 git 模块。所有文件和 Git 仓库在专属临时目录内；Git 禁用 global/system 配置，未配置远端，没有 socket 或真实凭据。结束及失败时清理临时目录。

最后执行退出码为 0，输出依次为 AUTH、SYMLINK、WORKTREE、TASK_PATH、GIT_PATH、MIRROR 和 CLEANUP。六个断言分别覆盖上述五个问题。SD1 的完整 HTTP/WS 利用、SD2 的全 runtime 路由以及真实远端同步未执行，相关可达性由静态调用链确认。

## 限制与后续验证

- 本分项不宣称已经完成动态渗透、真实 Keychain/Telegram/GitHub 服务验收或 Electron 安装包攻击验证。
- 存储原子性保护进行了静态审读，断电、磁盘故障、SQLite 损坏与文件系统特殊语义需要另行故障注入。
- 完整原生浏览器的导航、scheme、证书例外和 IPC sender 安全需要隔离 Electron 验证；继续遵守不启动 SharkBay 的限制。
- 随后修复时，应按“默认网络授权—统一内部路径边界—worktree Git 路径—镜像一致性—特殊文件名契约”拆分，保留独立回归证据。
