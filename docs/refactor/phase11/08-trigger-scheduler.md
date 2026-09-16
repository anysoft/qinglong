# Trigger Scheduler

一个共享 1 秒循环查询 indexed next_fire_at，单批最多 500 个到期 Cron；没有每 Trigger 定时器。单次 tick 的本进程重入被阻止；多进程靠 SQLite IMMEDIATE 事务和唯一事件键协调。

在同一事务里记录到期事件并推进 next_fire_at，随后收件恢复器每批最多处理 100 个 RECEIVED/PROCESSING 事件。提交仅调用 ExecutionService.submit。并发、重试、lease、取消、超时、ENV/Config/Hook 快照和 Runner 均继续由 Phase 10 引擎负责。

HTTP 启动注册 TriggerScheduler；关闭时先等待 TriggerScheduler 停止，再关闭 ExecutionService。订阅同步及系统维护的旧 ScheduleService 尚有独立职责，不能误删。
