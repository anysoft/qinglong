# Trigger Domain

Task 定义执行什么；TaskTrigger 定义何时提交。允许零到多个 CRON / WEBHOOK / GIT_UPDATE；MANUAL、API 仅为 TaskRun 来源。Task.enabled 与 Trigger.enabled 独立。

TaskTriggers 保存 task_id、type、origin、enabled、version 和 discovery_key。CronTriggers、WebhookTriggers、GitUpdateTriggers 分别保存类型专属配置。没有任意 command、executable 或 JSON 通用配置执行入口。Panel CRUD 使用 expected_version，类型创建后不可通过服务修改。用户编辑 Discovery Cron 后 origin 变为 USER，保留发现身份。

Clone 复制 Trigger 为 USER，Task 默认停用。Webhook 使用全新 public_id 与 256-bit secret；响应仅一次提供克隆 secret。删除 Task 级联定义，TaskRun 和 TriggerEvent 保留空引用历史。活跃 Run 仍阻止 Task 删除。
