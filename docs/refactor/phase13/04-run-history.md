# Run / Attempt History

GET /api/task-runs 使用 id DESC keyset：task_id、status、trigger_type、from/to、cursor、limit（默认50，上限100）。时间过滤作用于 submitted_at；cursor 只携带 ID，不依赖 offset 全页扫描。

Detail 返回身份、Task、Trigger ID/Event ID、状态、时间、duration、attempt count、exit/signal、canonical result、错误、快照和日志 metadata，去掉 owner_token。Attempts 返回每次 result（含 timeout/cancel/hook outcomes/secondary errors）、duration、retry_decision/retry_delay。原 Result 不被通知失败回写。

Resources 复用 executionMetadata 的 ID/revision/build/checksum/hash，不存完整 Context。Run→Trigger Event 展示安全详情；Trigger Events 的 Run 链接打开 /runs?run=ID。

Dashboard 24h/7d/30d：SQL 聚合结果、成功率、运行/队列、最近 Run/失败、最长运行、不健康 Tasks、触发类型统计和存储。成功率分母为 SUCCESS/FAILED/TIMEOUT/INTERRUPTED；CANCELLED/SKIPPED 不计。Readiness 通过既有 resolver 每批500、缓存30秒，不载入全部 Run。

Task latest status 已改成 SQL MAX(id) 每 Task 获取最新 Run，避免 Task 列表加载全部历史。统计与展示均不依赖旧 TaskStats/TaskViews。
