# Phase 13 — Observability Domain

TaskRun 是唯一执行历史事实来源，继续使用 Phase 10 的 TaskRuns / TaskRunAttempts。TaskRunEvents 记录生命周期；TaskHealthStates 是终态驱动的读模型；NotificationOutbox / Deliveries 是独立投递域，不是第二套执行历史。

ExecutionService 负责原有解析、尝试、清理和终态。SQLite terminal trigger 在相同事务更新健康状态、评估 Policy 并创建 Outbox。网络请求只由 NotificationDispatcher 执行。ProcessRunner 未修改。

Readiness 回答资源能否执行；Health 回答已完成运行的表现。两者不互相覆盖。TriggerEvent FAILED 且无 Run 不触发 Task 通知。

实现入口：back/services/runObservability.ts、runLog.ts、notificationChannels.ts、notificationDispatcher.ts、back/schema/observabilitySchema.ts。SQL-owned 表不通过 sequelize.sync 重建；初始化必须走 initializeOperationalSchema。
