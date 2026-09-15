# Execution Environment Transport

## 入口与生命周期

原 `CronService.makeCommand/runSingle`、`runCron`、系统 crond 均保留命令与调度语义。Task 在 task.sh 解析原 ID 后，经内部 `taskEnvironment.js`（开发环境为 ts-node）从 SQLite 解析一次。无 ID/无数据库的独立 CLI 保持原路径；未配置 Profile/Task vars 返回空结果，不分配快照。

`ExecutionEnvironmentTransport` 写 `$QL_DIR/.tmp/task-env/run-<随机值>/`，目录 0700，全部文件 0600。目录独占创建，拒绝 .tmp/task-env 的符号链接。文件仅包含 owner metadata、snapshot.json、原 Global 三份文件的执行副本及安全单引号编码的 overlay.sh。值不进入 argv；辅助进程 stdout 只传不透明目录路径。

task.sh 使用本次 Global Shell 副本；Node/Python preload 使用本次各自 Global 副本，再应用同一 JSON overlay。Shell 用安全引用的 overlay.sh。UNSET/SET 不通过 eval 拼接数据。现有 before hooks、语言依赖路径和 scripts/cwd 继续原模型。

## 日志和 cleanup

Scoped 输出在原 tee/文件重定向之前经过流式脱敏；跨 chunk 的已知 Secret、URL/base64 表示和账号拆分值不会直接落盘。conc 账号模式的中间日志位于私有 Snapshot 目录，0600；原账号选择与最终日志流程保留。

Node/Python before 的环境回传文件在 Scoped 路径下使用随机运行目录与 0600，不再把 Scoped Secret 写入旧 `/tmp/env_PID.json`；无 Scoped 的旧路径不变。

task.sh EXIT trap 清理其拥有的目录；启动及后续 prepare 尝试清理一小时以上、owner PID 已不存在的目录。活跃 owner 不删除。清理失败不阻断旧服务启动，显式配置的任务在 prepare 无法安全创建目录时失败。PID 复用可能推迟清理；没有宣称 SIGKILL/断电时立即擦除。

## 限制与保留

单值不超过 120 KiB，含 Base 的总环境使用 128 KiB 保守预算，超出返回 ENVIRONMENT_TOO_LARGE，保留平台 argv/bookkeeping 余量。NUL 返回 ENV_VALUE_INVALID。名称使用 portable identifier，并保留 QL_TASK_ENV_*、原 runner 的 dir_/file_/cmd_、命令/日志/ID/hooks 及 Bash readonly 等内部名字，防止配置改写执行控制数据。

Snapshot 不写 scripts/worktree/Git/log 根，不修改 Global 生成文件，不传给 Backend Git fetch、订阅发现、依赖安装器或通知服务。Task 自己主动调用的子进程自然继承该 Task 的环境；这与 Backend 的其他作业是不同边界。没有更换 Node/Python executable 或实现 Runtime 管理。
