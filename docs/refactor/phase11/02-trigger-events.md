# Trigger Events

TriggerEvents 是持久化事件收件表：RECEIVED / PROCESSING / SUBMITTED / SKIPPED / FAILED。它不拥有任务重试、并发策略或执行进程。

唯一约束 `(trigger_id,event_key)` 合并重复事件；TaskRuns.submission_key 唯一保存 `event:<id>`。TaskRun 同时保存 event_id、trigger_id。事件只保存计划时间或仓库、Worktree、before/after 提交等安全元数据，不保存请求体。

事件定义删除后保留；外键 SET NULL。最近 20 条按 Task 查询，UI 可以查看对应 TaskRun。
