# Subscription 新模型与兼容字段

| 当前字段 | 决策 | 理由/目标 |
| --- | --- | --- |
| id/name | KEEP | 稳定身份/展示名 |
| repository_id | KEEP，改必填 | 每个订阅属于 Repository；不再 URL-only |
| branch | RENAME ref（含 type） | 4.5B 先维持 branch 能力；tag/commit sync 是以后明确功能，不能假装已支持 |
| worktree_id | KEEP | durable binding；允许未准备状态 NULL 是生命周期需要，不必为去兼容强行 NOT NULL |
| url/type(public/private/file) | REMOVE | URL 归 Repository，认证类型归 Credential；file 订阅不在目标 |
| credential_id/pull_type/pull_option | REMOVE | Repository owns credential；去内嵌密码/私钥/override |
| git_mode | REMOVE | 新平台唯一管线，无 migration/fallback |
| alias | REMOVE 身份职责 | 当前日志/删除仍用它；先用 subscription ID 日志目录与 publication prefix，再去字段 |
| schedule/schedule_type/interval_schedule | MOVE（后续） | 调度触发定义；4.5B 保留 cron/interval adapter，Phase 9 分离 |
| whitelist/blacklist/extensions | MOVE/RENAME | DiscoveryPolicy.include/exclude/extensions；保留筛选能力，重新定义明确语义 |
| dependences | MOVE/RENAME | 它是辅助文件 copy filter，不是 pip/npm；暂记 publication support_files，11/Runtime 后删除 |
| autoAddCron/autoDelCron | MOVE/RENAME | discovery_policy reconciliation；缺失源建议 disable/retire 而不是无条件删手工 Task |
| env_profile_id | KEEP | Task > Subscription > Repo 默认；不复制 secrets |
| is_disabled/status | RENAME | enabled / sync status；禁用不删除资源 |
| last_synced_commit/last_sync_at/last_sync_* | KEEP/RENAME | 成功 watermark 与失败状态分开；失败不覆盖上次成功 |
| pid/log_path | MOVE | 未来 sync run；4.5B 仍需 stop/log bridge |
| sub_before/sub_after | DEFER/MOVE | Hooks Phase 5；不是遗留 URL 才需要 |
| proxy | REMOVE 订阅字段 | Managed 现在明确不支持；未来 Git transport 独立网络配置 |
| command（非持久字段） | REMOVE 对外 | 内部 dispatch 用 ID，不承诺旧 ql command |

## Credential override 判断

当前实现确实支持 Subscription override > Repository default > anonymous，Managed 与 Legacy 都在用，不能称为死代码。但没有发现租户隔离/每分支权限等必须将 credential 放 Subscription 的领域模型。建议 4.5B 删除 override：Repo 持有当前网络凭据，匿名仍是明确合法选择；缺失/disabled credential 必须失败，不能偷偷 fallback。迁移 override 不是本项目义务，fresh UI/API 不再接受它。

## Worktree purpose 判断

USER/SUBSCRIPTION 是创建来源，不是兼容模式。ensure 按 repository+branch_key 复用；用户工作区被 Subscription 引用后仍可 purpose=USER。所有删除保护必须依据实际引用+lease；不能“SUBSCRIPTION 就级联删 / USER 就不受管理”。目标是独立 Workspace resource，可保留 created_by/purpose 作 metadata，去掉控制权限/所有权的歧义。建议保留当前一仓库一 tracking branch 约束，未来多 Workspace 同分支须单独设计。

## 新保存与同步契约

Repository required → 验证 ref/credential → 预检准备可失败 → 保存/绑定 → Sync → fetch/FF → DiscoveryPolicy → publish/reconcile → 记录结果。预检是有网络/工作区副作用的 prepare，不是只读验证；去掉 mode toggle 不等于删预检安全检查。删除订阅默认解除引用，不删除 Repository/Worktree，不以 alias 删除 scripts；Task 来源删除策略须明确确认且 transaction/locks 协调。

失败、dirty/ahead/diverged、同仓库共享分支、并发绑定、无变化重试、文件/DB/调度补偿必须继续测试。
