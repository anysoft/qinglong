# Subscription Sync / Discovery

Repository必填 → 当前仓库凭据 → initialize/fetch → ensure Worktree → clean/local history检查 → FF → DiscoveryPolicy → DiscoveredTaskDefinition[] → TaskService.reconcile → 成功水位与事件。无变化commit仍可重新reconcile，以修复上次发布失败。

当前Managed服务实现前半段，并通过Shell scanner+scripts/Cron publication bridge完成后半段。4.5B去Legacy/Managed双轨、URL/内嵌凭据/override；抽scanner库、DB投影、ID publication prefix。不得删scan/filter/补偿能力，完整DiscoveryPolicy/parser在11。

目标只操作subscription-owned definitions；手工Task与用户覆盖不得被文件缺失误删。Definition由workspace+relative_path+entrypoint identity产生，name/schedule不是主键。任务缺失源的默认策略建议停用/退役并保留Run历史；实际策略在新API中显式选择。

锁序继续subscription→repository→worktree→publication→scheduler mutation。SQLite与Git/文件系统/外部scheduler不构成单事务，保留recovery material与失败可重试；fresh-only不会消除崩溃窗口。
