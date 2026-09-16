# TaskRun Events

TaskRunEvents: id、task_run_id FK CASCADE、sequence、type、metadata、created_at。UNIQUE(task_run_id, sequence)。SQLite 写事务串行分配 MAX(sequence)+1；应用附加事件使用 IMMEDIATE 事务。

数据库产生 RUN_SUBMITTED、RUN_QUEUED/RESOLVING/RUNNING/终态、CANCEL_REQUESTED、ATTEMPT_STARTED。Coordinator 产生 BEFORE/MAIN/AFTER/FINALLY 的 STARTED/FINISHED、RETRY_SCHEDULED；恢复路径产生 RECOVERY_STARTED/FINISHED。RECOVERY_REQUIRED 也作为真实状态保留。

metadata 只允许 attempt、phase、retry_delay、hook_id、status；数字须有限，字符串为短大写静态枚举。没有 argv、ENV、Hook 文本、异常栈或 stdout 行。未到达的阶段不伪造完成事件。

GET /api/task-runs/:id/events?after=sequence 每页最多 200，UI 支持翻页。迁移不为旧 Run 伪造无法证明的完整 Timeline。
