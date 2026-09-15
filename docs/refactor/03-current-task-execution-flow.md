> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Task Scheduler / Executor / Hooks / Logs

## 真实调用链

| 入口/阶段 | 文件 / 函数 | 输入、输出及副作用 |
|---|---|---|
| 手工 | `src/pages/crontab/index.tsx` → `back/api/cron.ts` PUT run → `CronService.run` | ids → queued + randomUUID queued_token；调用 runSingle |
| 手工排队 | `back/services/cron.ts:runSingle` | manualRunWithCronLimit；重新读 DB，校验 token；生成毫秒日志文件，spawn 后以条件 UPDATE 认领，认领失败 kill child |
| 定时配置 | `CronService.create/update/enabled/disabled/remove/autosave_crontab` | `withSchedulerMutation` 跨进程文件锁保护 DB + 注册/回滚 + crontab.list |
| 模式选择 | `CronService.schedulerMode/shouldUseCronClient/isNodeCron` | QL_SCHEDULER 显式 system/node，否则检测 crond；system 下五字段用系统 cron，六字段或 extra_schedules 用 gRPC；特殊 once/boot 单独处理 |
| Node 定时 | `back/schedule/client.ts` → `back/schedule/addCron.ts:addCron` | protobuf snapshot → node-schedule jobs；callback `shared/runCron.ts:runCron` |
| 系统定时 | `CronService.setCrontab` | 写 config/crontab.list、system 模式 `crontab file`；crond 调 Shell，绕过 Node queue |
| 命令包装 | `CronService.makeCommand` | 非 task/ql 前缀加 task；附 real_time/no_tee/ID/log_name/task_before/task_after/work_dir |
| 进程 | `runSingle` 或 `runCron` | cross-spawn command，shell=/bin/bash；observeChildProcess 等 close 和双流 drain |
| Shell | `shell/task.sh` 顶层 | source share.sh/api.sh、import_config；format_params（`--` 分隔内置参数和脚本参数）、define_program、handle_log_path、source otask.sh |
| 上下文 | `shell/otask.sh:check_file/append_node_dependency_path/enter_script_workdir` | 按语言注入 ENV、preload、NODE_PATH；定位 work_dir 或 scripts/脚本目录 |
| 执行 | `otask.sh:main/run_normal/run_else/run_concurrent/run_designated` | Python3 / node / source .sh / ts-node-transpile-only；支持 now/conc/desi |
| 返回 | `otask.sh` 尾部 → `share.sh:run_task_after/handle_task_end` | 保存脚本 `$?`，after，再 API status + stat；task.sh 自身最终 exit 0 |
| 持久化 | `shell/api.sh:update_cron/record_cron_stat` → `CronService.status` / dashboard stat 路由 | Crontab 状态+pid+log_path，RunningInstances.exit_code/status，日统计 |

## Scheduler 行为边界

CronExpressionParser 校验加 `back/validation/schedule.ts`；gRPC addCron 进一步拒绝裸 `/N` 和 `?`。普通 schedule 字段、extra_schedules 都必须保留。boot/once 不进入普通周期注册。修改任务取消旧 job 并注册新 job，失败路径有回滚；worker 重启通过 readiness invalidation 和完整 replace snapshot 恢复。`initData` 重置遗留执行状态、生成 ENV、恢复调度；`bootTask` 跑启用的 boot 任务。

队列是每进程内存 PQueue：cron、manual、subscription、script、system 各自默认 max(CPU,4)，依赖安装=1，日志更新=1；systemConfig.cronConcurrency 调整 cron/manual，不是全局统一共享并发额度。runCron 单实例模式检测已有 pid 后先 kill 老任务再执行新任务；超过五个重复排队限制并发出通知。不能视为原子跨进程执行锁。系统 crond 不走 PQueue，手工与定时也在不同进程/队列。

| 能力 | 当前状态 |
|---|---|
| 配置变更文件锁 | 已实现 proper-lockfile，stale 30s/update 10s/50 次重试；不是 repo 或 runtime 锁 |
| 手工启动认领 | queued_token + log_path 条件 DB UPDATE；stop 可阻止旧 snapshot 覆盖新状态 |
| PID / instances / kill | 已实现；`config/util.ts:killTask` 递归进程树信号，stop/stopInstance 更新 stopped；并非 detached 新进程组 |
| timeout | CommandTimeoutTime / task -m，存在 timeout 时 `timeout --foreground -s 2 -k 10s`；.sh 清空 timeoutCmd，需单独确认脚本超时语义 |
| 任务自动 retry | Not implemented（DB busy 重试、RPC 恢复不是任务重跑策略） |
| 持久化队列 / crash exactly-once | Not implemented；DB 状态与内存队列不是事务执行日志 |
| missed cron catch-up | 未发现持久化补跑；NEED RUNTIME VERIFICATION 于停机/时区跳变场景 |

## 执行上下文

- cwd：spawn 没显式 cwd，继承服务进程；task run_normal 默认 cd scripts，含子目录则 cd script dirname。work_dir 优先，绝对路径直接用、相对路径从 scripts 解析；不存在则警告并回退。设 work_dir 时 command 路径可能退化为 basename。
- PATH/HOME：继承服务环境，share.sh init_env 重设 NODE_PATH；Docker/native 启动脚本再定义 PATH/PYTHONPATH/PNPM_HOME。没有 per-task managed runtime lookup。
- uid/gid：spawn 无覆盖，继承面板身份；没有 task sandbox。
- env：不把 Envs 表合并进 Backend process.env。Shell/config 与语言 preload 导入全局生成文件；详细见 04。
- signal：task.sh trap INT/TERM/HUP/ALRM/TSTP/QUIT，调用 single_hanle；Python/JS preload 对 SIGTERM 处理为退出 15。不同包装层 exit_code 不能直接等同。

## Before / After

任务字段 `task_before/task_after` 在 Crontabs，UI modal 配置；全局文件在 config/task_before.sh、task_before.js、task_before.py、task_after.sh。

Shell：handle_task_start → check_file/source ENV → global task_before.sh → eval task_before → main → 捕获 exit → global task_after.sh → eval task_after → clear_env → handle_task_end。普通非零返回仍走 after；显式 exit、fatal signal/强杀可能跳过，非可靠 Finally。

JS/Python：preload 先加载 ENV，再用独立 Bash source before.sh + task_before，把环境通过 `/tmp/env_PID.json` 带回子进程，随后 require/import 对应 task_before.js/py。环境变动可传回语言进程，cwd 不随子 shell cd 返回；语言进程环境不会回传外层 after Shell。after 仍由外层 Shell 执行。尚无 AfterSuccess/AfterFailure/可靠 Finally 分类。

订阅 sub_before/sub_after 在 Subscription，promiseExec 独立 exec 子进程，失败捕获后继续；前置 shell export/cd 不持续影响主 clone 子进程，after 在 onEnd 执行，包括执行失败后的清理。

## Logging 与 Notification

手工 task：runSingle 选择 `{uniqPath}/{YYYY-MM-DD-HH-mm-ss-SSS}.log`、传 real_time=true，由 logStreamManager 写 stdout/stderr；调度 task：Shell no_tee 重定向或 tee，实时路径覆盖/自定义 log_name；`/dev/null` 手工路径存在特殊处理，不可统一删去。`handle_task_end` 写结束 marker，LogReader 支持 offset/chunk，cron/log/subscription API 给 UI 读取，`SubscriptionService.logs` 列目录。

Subscription：alias/秒级时间.log，回调串接 before/stdout/stderr/after/结束；同秒同 alias 并发可碰撞。System：Winston syslog/%DATE%.log，20 MB、7 天；`ql log` tail -F 当前日期文件，跨午夜行为需验证。Task retention：`shell/rmlog.sh` + systemConfig.logRemoveFrequency；RunningInstance/CrontabStat retention 另由 RetentionService 策略清理，不能混同日志轮转。Dependency 日志是 DB JSON 数组 + SockJS。

通知三条路径：脚本 sendNotify/notify.py 或内置 QLAPI.notify；subscription 扫描增删通过 notify_api；Backend NotificationService.notify 用 Auths.notification 配置，重复任务警告也走服务。未见 Runner 按每个 exit code 自动全局通知的统一策略。外部提供方真实发送未测试。
