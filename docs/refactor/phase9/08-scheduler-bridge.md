# Scheduler / Runner Bridge

TaskService 不负责进程运行、停止或日志。SchedulerBridgeService 提供窄的定义变更协调、发现发布和调度重建入口；CurrentTaskBridgeService 封装原有 crontab.list / scheduler / run / stop / result / log 实现。TaskExecutionBridge 是当前手工运行入口。

SchedulerProjections.id FK → Tasks.id；command 是派生输出，不是 Task Source。变更在 scheduler mutation lock 内使用 SQLite IMMEDIATE 事务：保存定义、刷新投影、注册调度、写 crontab.list；失败回滚数据库并恢复外部注册。恢复失败明确报告 TASK_SCHEDULER_RECOVERY_REQUIRED。

B03 crontab.list 永远只输出，不从它重建 Task。B04 node/gRPC 与 protobuf 保留。B08 `/crons/status`、`/crons/detail` 等结果通道和 B14 日志接口保留；旧 Task CRUD 返回 410，使用 `/tasks`。

B01/B02 staging 与 task.sh 继续临时执行；Runtime/Settings 新策略尚未激活。B17 对 Task 已使用 canonical TaskSource，通过 SourceBridge 定位当前 staging。不是 Worktree direct execution。

## SDK / IPC

`shell/preload/task_types.py` 定义正式逻辑 Task DTO。现有 client.py 的 CronItem 等名称仅描述冻结 protobuf IPC，不再是正式 Task API 类型。gRPC create/update/delete/enable/disable Cron 返回 410 TASK_API_REQUIRED，避免通过旧 SDK 直接改投影；读取、当前运行与结果 IPC 继续保留。新 Task 定义使用 panel-session `/api/tasks`，本阶段不新增 Open API 或改变 protobuf wire 名称。
