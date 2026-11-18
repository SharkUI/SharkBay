# Git 镜像、文件名与浏览器授权修复

对应 SD1、SD4、SD5；SD2/SD3见进度表第二批。没有启动完整ApplicationRuntime、桌面或真实索引；HTTP/WS回归只使用临时静态目录和fake runtime，不执行实际项目命令。

## SD1

移除私有网络与loopback地址免认证；所有业务HTTP/WS均使用已有的host-issued一次性grant换取session cookie。保持LAN监听与远程访问功能，没有新建用户/权限系统。主机控制端和终端显示一次性连接链接；revoke撤销所有grant、session和连接，不再保留LAN例外。

HTTP命令读取body后再次确认session与活跃client；WS等待terminal查找后再次确认，避免慢请求在撤销后继续执行。所有向浏览器发送事件的统一入口也验证session，过期不等待heartbeat才停止发送。已在撤销前执行的主机操作不会被宣称自动回滚。

`web-runtime-security.test.ts`验证一次性交换、过期、限流和撤销。`web-server-auth.test.ts`实际通过loopback HTTP/WS验证无cookie拒绝、有效cookie连接和命令、grant不可重复消费、慢body与等待terminal中的撤销阻止新执行、socket关闭以及待用grant撤销；业务操作为spy。完整runtime集成fixture已适配授权，但仍保持opt-in并未运行。

## SD4

先成功列出远端树，再把所有对象完整准备到同一mirror父目录的临时快照；读取失败保留原快照。发布通过目录rename，失败恢复原目录，成功清理旧镜像。因此远端删除、重命名及真正空树会反映到镜像，不再长期残留。列表失败不再伪装成空树。

watchTasks监听稳定的team-context父目录，重复替换后仍继续收事件。5项回归验证删除/重命名/空树、本地任务保留、树枚举失败、对象读取失败、发布失败回滚与后续watch。发布使用两次rename，存在短暂目录缺口，不称为OS原子目录交换；若回滚本身失败，会报告保留的旧快照路径。文件边界沿用SD2受管理路径校验，未声称可防止其他同用户进程并发替换整个祖先路径。

本项修复的是远端任务**镜像**。本地已完成任务仍按既有同步规则发布，远端删除不是本地历史任务的墓碑，不擅自删除用户本地任务。

## SD5

Git status改用porcelain v1 -z，按NUL切分；rename/copy使用destination并消费下一条original，不按箭头或换行猜测路径，不trim文件名。真实临时Git验证中文、换行、tab、引号、反斜线、首尾空格和字面箭头；parser回归验证rename/copy记录后仍能正确读取后续文件。数据模型仍为JavaScript字符串，本轮未宣称任意非UTF8文件名字节可无损往返。

最终统一测试与类型检查见 [final-verification.json](final-verification.json)。
