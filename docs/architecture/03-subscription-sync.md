# Subscription Sync / Discovery — Phase 11

Repository → credentials → initialize/fetch → ensure Worktree → clean/local history checks → FF-only update → Discovery v2 → Git Update Trigger events → success watermark。

唯一正常流水线是 ManagedSubscriptionService。Subscription 保存 Repository、branch/Worktree、同步计划与同步状态；DiscoveryPolicies 独立保存文件筛选、语言和 enabled。Worktree 是源代码位置，不复制 scripts，不发布 Task command，不恢复 crontab.list。

锁序为 Subscription → Repository → Worktree。Discovery API 独立 Preview/Apply 同样获取现有 Worktree guard。Reconcile 在数据库单事务中更新 Task 与 DISCOVERY Cron，保留用户资源。Task 身份为 subscription_id + SHA256(relative_path)。源移除先停用并保留资源/历史，重命名建立新身份。

Git 更新成功但 Discovery 失败时，保留已更新的 Worktree，last_sync_phase 标为 DISCOVERY，成功水位不推进；同 HEAD 重试可重新 reconcile。Git Trigger 在其后，以之前成功水位与当前提交生成唯一事件。

详见 [流程图](15-discovery-triggers.md)、[Discovery](../refactor/phase11/06-discovery-v2.md) 和 [Ownership](../refactor/phase11/07-discovery-ownership.md)。
