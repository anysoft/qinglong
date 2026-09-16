# Notification Crash Recovery

1. terminal transaction 前 SIGKILL：Run、Health、Outbox 一起回滚。
2. terminal commit 后 SIGKILL：Outbox 已持久化，重启实际发送。
3. SENDING owner 消失：先获取 FD lease 证明没有活跃发送者，将 attempt 标 INTERRUPTED、Outbox 持久化为 RETRY；下轮重新claim。
4. 外部服务已收件、SENT 未写回：重试可能再次收件。同一 dedupe key，WEBHOOK 通过 Idempotency-Key header 提供给接收方；其它适配器不保证支持幂等。

不能仅按 claimed_at 超时抢占仍发送的活跃 worker，也不能凭数据库 PID 发信号。运行与投递持不同 lease，不延长 Runner 资源 pin。

测试使用独立真实 Node worker、SQLite、FD lease、本地HTTP和SIGKILL。覆盖阈值第3次失败与恢复成功的commit前后窗口，验证每次仅一个内部逻辑Outbox。外部重复窗口明确允许，并非 exactly-once。
