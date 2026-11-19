---
kind: sharkbay_task
taskId: B7N4P2-u3960864-m81ae10
taskTag: B7N4P2
mode: task
title: 打测试包并覆盖启动 103
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Codex GPT-6
sessionId: 01a1edf1-0eb3-7c32-ae19-51cc6395dc3f
branch: main
createdAt: 2026-11-19T03:08:34Z
updatedAt: 2026-11-19T07:05:10Z
completedAt: 2026-11-19T07:05:10Z
---

## Summary
已基于固定工作区快照制作并安装 B7N4P2 测试包，覆盖并启动 103 的 SharkBay，包含 T8P4W2 Tasks 修复及 Island 开关。用户授权结束的 3 个旧终端已停止；新 Runtime/LAN 访问通过，原 2 个项目和已有配置值保留，旧正式应用及配置已备份。

## Files
- .sharkbay/tasks/B7N4P2-u3960864-m81ae10-test-build-install-103.md
- release/test-B7N4P2/（忽略的测试包、快照及日志）
- 103:/Applications/SharkBay.app
- 103:~/.sharkbay/install/test-B7N4P2/（安装暂存、旧应用与配置备份）

## Work
- 用户授权打测试包并覆盖 103；包含当前工作区 T8P4W2 Tasks 修复及 Island 开关等未提交修改，版本保持 0.3.12，测试构建以 B7N4P2 标识，不创建正式版本/发布/提交。
- 已读协议、AGENTS.md 与只读团队任务 T8P4W2-u3960864-m81ae10、U3K8R2-u3960864-m81ae10；103 当前为正式 0.3.12，App PID 84228、Runtime 84237、*:17777。
- 计划：固定工作区快照 → 类型/测试和 ad-hoc 测试 pack → 包内 Runtime/签名及传输核验 → 检查活动会话、备份、显式停止并替换启动 → LAN HTTP/WS 与配置/任务修复验收。
- 不修改或提交现有源码、用户配置、团队镜像；若存在活动终端，先完成暂存，切换前处理会话边界。

- 已固定 de18818 + 当前 13 文件 SHA-256/二进制补丁到独立 worktree /tmp/sbtest-B7N4P2-65_uz4lr，npm ci 完成；pack/测试进行中，类型检查通过。原工作区不改动。
- 控制端只读检查确认 103 有 3 个 running、0 个 exited 终端；先完成测试包和暂存，结束这些会话并切换 Runtime 前需要用户明确选择，尚未操作运行实例。

- 当前快照独立 typecheck、689 tests、14 Runtime integration、ad-hoc pack、严格签名和隔离 HOME 的包内 Runtime/SQLite/PTY/桌面退出存活/显式清理均通过，正式测试 ZIP 正在传输；旧实例及 3 会话仍保持。

- ZIP 传输与暂存完成，远端 SHA-256/版本/strict signature/隔离真实包内 Runtime 测试通过，日常 3 终端仍运行。已向用户确认是否结束这些会话并切换，等待选择；测试包已就绪，不再有构建阻碍。
- 13 文件源码快照及补丁保存在本任务产物目录，101 个编译 Runtime/WebUI 文件逐字节与包内一致，Tasks 项目 key 确认包含。

- 构建独立 worktree 已清理，测试 app/ZIP/源码快照/摘要/日志及 103 暂存包保留。安装切换尚未执行，等待用户对结束 3 个运行终端的明确答复；任务保持 active。

- 用户明确同意结束 3 个会话并切换；恢复时再次确认同一 Runtime PID 84237、3 个 running 会话，测试暂存包存在且未替换。现在备份配置/旧应用，精确退出旧桌面、显式停止 Runtime，再替换启动。

- 已正常停止旧 Runtime 84237 和授权结束的 3 个终端；旧桌面 84228 在 SIGTERM 等待后仍存活，核对精确路径后 SIGKILL 退出。旧应用移入备份，新测试包替换并启动。
- 新桌面 PID 99475、Runtime PID 99480，*:17777 正常提供测试构建；ASAR/静态资源摘要完全匹配，原 2 个项目保留。首次全配置哈希相等检查因预期 Island 配置迁移不通过，逐字段复核确认仅新增 islandEnabled=true，已有值未变。
- 已清理远端传输 ZIP/空暂存目录/验证脚本；保留旧正式应用、私有配置备份及 verification.json。本地保留测试 app/ZIP/快照/日志，不创建提交、不发布、不改主工作区源码。

## Verification
- SSH、arm64、当前应用与 Runtime 进程及监听确认通过。

- 快照 13 文件逐字节匹配当前工作区，build-state.json/source.patch 留档；独立 worktree npm ci、typecheck 通过，远端控制接口 hello/terminal.list 成功（未记录终端内容）。

- 独立快照 `npm run typecheck`、`npm test` 93 文件/689 tests、`npm run test:integration` 14 tests、`npm run pack -- --config.mac.identity=- --config.mac.notarize=false`、`codesign --verify --deep --strict`、隔离 `verify-packaged-runtime.mjs` 通过，日志保存在 release/test-B7N4P2。

- 测试 ZIP 185390261 字节，SHA-256=3f133a3ab285fef56dc08c1c5e0e1b32ae8851d876f8b930ed40f14e7acca369；103 暂存包的严格签名、包内 Node/SQLite/WebUI/PTY/桌面退出存活和显式清理通过，未触碰日常实例。payload-verification.json 确认 101 个编译文件与构建一致。

- install-verification.json：运行路径/新 PID/0 终端/2 项目/strict signature/ASAR 与资源哈希/旧包备份通过；配置逐字段保留，唯一迁移为 islandEnabled=true。
- network-verification.json：局域网普通 URL index、JS、capabilities 200，无 Set-Cookie，WS hello 和 config.get 成功；实际提供的 JS SHA-256=dbf890f41e0ec7be4478e7cacc9bf02ee8b66f519cbbcd3b67b42e47e5798b98，与包含 Tasks 项目 key 的测试构建完全一致。
- 最终 git diff --check 通过，既有 13 文件工作区变更保留，没有新源码变更或提交。远端备份 ~/.sharkbay/install/test-B7N4P2/SharkBay.previous.app。

## Notes
- 旧正式应用与配置保留回退；测试包使用 ad-hoc 签名，不提交 Apple 公证或更新 GitHub/Homebrew。
