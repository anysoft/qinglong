# Schema v5 → v6

Phase 8 实际基线为 v5，提交 47294399de53dd857caa8caa936fc9d4dbab0586。platform-v5.json 冻结其模型与 SQLite DDL 签名，旧 v1–v4 定义不变。v5 模型签名：632024721991a6f497272ff0d8e73f120705fa3f8ff279e0b0729e8a29ea4510；DDL 签名：70f7d5ad6dbc652be20b6611834b1a85f3613de4b02cfd7487c22b3eff80defe。

启动验证旧签名后，事务建立 Tasks、TaskSources、TaskRuntimeBindings、TaskExecutionSettings、RuntimeDefaults，重建 SchedulerProjections 与 Task-owned FK。CrontabStats/Views 变成 TaskStats/Views，RunningInstances 物理列为 task_id；旧 cron_id 仅保留传输属性映射。

迁移保留 Task ID、ENV Secret、Config/Hook 归属、统计与运行记录。只从旧 structured source_relative_path + Subscription Worktree 建源；command-only 定义保留 ID 与历史投影，要求补充配置，绝不解析 command 猜 Source。迁移初始调度投影禁用，直到定义校验后重新生成。

DDL 在事务内执行，失败回滚并可重试。Fresh latest 与 v5 migrated 的规范化 DDL 签名必须相同；FK 检查必须为空。不会删除用户日志/Worktree/Runtime 文件。
