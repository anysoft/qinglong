# Managed 订阅模型

Phase 3 只替换显式选择 Managed 的订阅 Git 来源。旧 URL、旧 Repository 引用以及新建订阅的默认模式均为 `LEGACY`。

| 字段 | 含义 |
| --- | --- |
| git_mode | LEGACY / MANAGED；数据库默认 LEGACY |
| repository_id / credential_id | 复用 Phase 1，凭证覆盖优先于仓库默认凭证 |
| branch | 订阅选择；空值在预检时使用仓库默认分支 |
| worktree_id | 可空外键，引用 Worktrees；删除被引用工作区时 RESTRICT |
| last_synced_commit / last_sync_at | 最近成功发布的提交和时间；失败不覆盖 |
| last_sync_state | RUNNING / SUCCESS / FAILED |
| last_sync_phase / last_sync_error | 最近阶段及不含 Git 输出的错误代码 |

Worktrees 增加 `purpose=USER/SUBSCRIPTION`，历史记录默认 USER；Managed 自动创建的工作区标记 SUBSCRIPTION。复用用户工作区不改写创建用途。列表另外返回实际 `subscriptions` 引用，删除保护以引用为准。

迁移 `phase3-managed-subscriptions` 与旧迁移在同一 SQLite 事务中执行；重复执行幂等。完整迁移账本共 20 项。没有自动修改任何旧订阅的模式、命令、定时规则、过滤器或分支。测试夹具补建外键引用表，没有删除旧断言。

`worktree_id`、最近同步字段及本地路径不作为订阅 API 写入参数。只有服务端预检和绑定操作能够设置工作区。
