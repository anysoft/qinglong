# Subscription Sync / Discovery — 当前实现

Repository 必填 → 仓库当前凭据 → initialize/fetch → ensure Worktree → clean/local history 检查 → FF-only → Discovery Adapter → scripts staging / CronService publication → 成功水位。当前只支持 branch，不声称 tag/commit Ref Model 已实现。

不存在 Legacy/Managed 双模式、URL-only、credential override 或 convert。内部 `ManagedSubscriptionService` 名字表示唯一正常流水线，不是可切换模式。`subscription-ID` 是发布 namespace；展示名与 URL 不构成文件所有权。

`SubscriptionDiscoveryAdapter` 是 Backend discovery-only 边界：接收已锁定 Worktree、策略、私有 stage 和当前 DB Task 投影，产出变更与诊断，不 clone/fetch、不拥有 DB、不调用 HTTP、不读取 live crontab.list。保留 nested、extensions、include/exclude、cron/name 注释、autoAdd/autoDel；无 cron 的文件给出 NO_CRON_METADATA，不随机创建任务。

identity 为 subscription_id + SHA256(relative_path)，持久化 source_relative_path/discovery_key/discovery_definition。更新仅替换仍等于上次 source definition 的字段，保留用户覆盖、ENV、hook、禁用和运行状态。仅 reconcile 当前订阅所拥有的定义与文件。

锁序继续 subscription → repository → worktree → publication → scheduler mutation。私有 stage、上一版 live、DB/scheduler 补偿与 recovery material 保留。失败不覆盖成功水位，补偿失败保留材料并要求恢复；无变更 commit 仍可重试 reconcile。

B01 scripts 与 B15 Crontab 仍是执行桥。完整 metadata DSL、Task/Schedule v2 与 reconcile engine 属于后续 Phase 9–11。
