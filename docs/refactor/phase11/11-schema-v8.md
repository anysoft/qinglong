# Schema v8

冻结输入：back/schema/platform-v7.json / platformV7.ts，源 commit e1ee6f80，真实 schema/model signature 来自变更前空目录初始化。PLATFORM_SCHEMA_VERSION=8。

新增 TaskTriggers、CronTriggers、WebhookTriggers、GitUpdateTriggers、TriggerEvents、DiscoveryPolicies。TaskRuns 添加 trigger_id/event_id 外键及唯一 submission_key。Tasks.schedule 被移除；Subscriptions 旧筛选字段被移除。

迁移读取 canonical Tasks.schedule；Discovery metadata 一致则 origin=DISCOVERY，否则 USER 并保留发现身份。不会从 SchedulerProjection 反推定义。既有表、Task ID、资源、历史记录不重置。历史 SCHEDULE Run 来源仍可读取。

旧正则/辅助文件筛选不能安全等同于 glob。迁移保留 previous_settings 审计值并暂停相应 Discovery Policy，标记 MIGRATED_FILTER_REVIEW_REQUIRED；用户在新 Policy UI 明确保存 glob 后启用。不会扩大匹配范围或继续运行旧 DSL。旧 extensions 归一为语言。

整个升级在 IMMEDIATE 事务内，最终 foreign_key_check。中途注入故障完整回滚，原 v7 可重试。fresh 和 migrated 使用同一演进 DDL，测试比较完整结构签名及重启不变性。

用户已清空旧 schedule 时，以旧 metadata 的表达式保存 disabled USER 身份，避免后续发现恢复用户已删除的 Cron。
