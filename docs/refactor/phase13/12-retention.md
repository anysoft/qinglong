# Retention / Phase 14 Data Classification

自动删除默认 OFF；本阶段不实现手动cleanup或Backup/Restore。Task删除不会隐式删除Run/Attempt/Event/日志/投递历史；Channel归档保留历史。旧rmlog不可删除正式Run日志。

独有数据：Task/Trigger/Policy/Channel定义、Secret、Git本地提交和dirty文件、TaskRun/Attempt/Event/Outbox/Deliveries历史、Run日志。Health可由历史推导部分字段，但 incident 状态参与通知语义，仍随数据库一致保存。

可重建数据：Runtime/Environment物化与下载缓存（仍遵循已有ownership、references、lease，不意味着自动可删）。日志不属于可任意删除的cache。

Dashboard使用已记录log_size求和，终态更新；不递归扫全DATA_DIR。旧文件metadata可能为0，活跃增长未实时计入。以后需要保留策略应先Preview/Confirm、保护QUEUED/RUNNING/RECOVERY_REQUIRED并遵守FK。

Phase14必须协调数据库、日志、Worktree/Config journal和活跃发送的恢复窗口；历史Backup bridge当前不保证覆盖新数据。本阶段没有新Backup入口。
