# Task Notification Policy

TaskNotificationPolicies：enabled、notify_success/failure/timeout/interrupted/cancelled/recovery、failure_threshold 1..1000、repeat_every_failures 0..1000、channel_mode、version；TaskNotificationChannelBindings 为多对多。

DEFAULT 选择 enabled+is_default+非archive Channels；EXPLICIT 仅 bindings（空集合即不发）；NONE 不发送。显式 Channel ID 必须存在且未归档。Task clone 拷贝 Policy 和 bindings。

TIMEOUT、INTERRUPTED 的专用 flag 覆盖 generic failure；但依然计入失败健康状态。取消默认不通知，SKIPPED 从不通知。Attempt 失败不会评估 Policy，仅最终 Run 评估。

v8 NONE/SUCCESS/FAILURE/ALWAYS 转为等价 flags。旧 FAILURE/ALWAYS 的 cancellation 仍通知；repeat_every_failures=1 保留旧每次失败的行为；notify_recovery=0 不擅自改变旧语义。新 UI preset 使用 cancellation=false、recovery=true、repeat=0。旧 settings.notification 仅保留创建 preset/迁移输入，不再控制运行结束路径，修改通知必须用正式 Policy API。

GET/PATCH /api/tasks/:id/notification-policy；PATCH 全量显式 flags+expected_version。预设 NONE/FAILURE/SUCCESS/ALWAYS/CUSTOM 是编辑便利方式，持久化采用正式字段。
