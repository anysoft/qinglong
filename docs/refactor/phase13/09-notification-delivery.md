# Delivery Worker / History

每秒扫描 due PENDING/RETRY 与 SENDING，上限32；最多4个并发。SQLite索引 notification_outbox_due(status,next_attempt_at,id)。每条先获取稳定 notification-ID.lock 的 RuntimeLease FD，再在 IMMEDIATE 事务 claim；两个进程不能同时发送同一 Outbox。

事务结束才读 Channel secret/send；发送结束独立事务保存 Outbox 和 NotificationDeliveries。每个 attempt 有 start/finish/result/static error code，UNIQUE(outbox_id,attempt)。HTTP 超时10秒、响应64 KiB、禁止redirect；邮件也设10秒连接/socket限时。

默认最多5次，退避60秒指数增长、上限1小时（实现构造参数可测试注入）。禁用/归档/missing secret/无效URL直接 DEAD。可重试网络/服务失败到 RETRY，再用尽转 DEAD。

GET /api/notification-deliveries 支持 run_id/status/id cursor，每页100；:id/attempts 查尝试记录；POST :id/retry 仅 RETRY/DEAD 可用，复用原 Outbox/dedupe identity，不改 TaskRun。人工重试不清历史次数；超出预算后再次失败即 DEAD。

关闭时停止 claim，最多等待45秒活跃发送；未发完的行保持可恢复状态。无任何 delivery error 回写 ExecutionResult.secondaryErrors。
