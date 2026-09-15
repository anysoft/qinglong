# Step 0 database baseline

Source-derived schema; no production database opened. Actual isolated schema dump is recorded separately.

# Database / Fresh Bootstrap 清理计划

## 当前全部主库表

| 表 | 来源 | 分类 | 目标 / 操作 |
| --- | --- | --- | --- |
| GitCredentials | data/gitCredential.ts | NEW PLATFORM CORE | credentials；保留 secret 与访问策略 |
| Repositories | data/repository.ts | NEW PLATFORM CORE | repositories；去旧 spelling 限制，保留 ID/默认凭据 |
| Worktrees | data/worktree.ts | NEW PLATFORM CORE | worktrees；独立资源，保留状态/安全恢复 |
| EnvironmentProfiles | data/scopedEnv.ts | NEW PLATFORM CORE | environment_profiles；repo 内唯一 |
| RepositoryEnvVariables | data/scopedEnv.ts | NEW PLATFORM CORE | environment_variables（Profile FK） |
| TaskEnvVariables | data/scopedEnv.ts | NEW PLATFORM CORE / RENAME CANDIDATE | task_environment_variables；cron_id 后改 task_id |
| Subscriptions | data/subscription.ts | RENAME/REPLACE CANDIDATE | repository 必填，去旧 URL/模式/内嵌认证 |
| Crontabs | data/cron.ts | TEMPORARY / RENAME CANDIDATE | Phase 9 Task + Schedule；Phase 10 TaskRun |
| Envs | data/env.ts | REPLACE CANDIDATE | Global 唯一 key；不能直接删 Global 能力 |
| Dependences | data/dependence.ts | TEMPORARY | Runtime 前保留；不新增业务绑定 |
| RunningInstances | data/runningInstance.ts | TEMPORARY / RENAME CANDIDATE | TaskRun；保存运行历史不是一次性 cache |
| CrontabStats | data/cronStats.ts | TEMPORARY / RENAME CANDIDATE | task_run 聚合/read model，保留历史事实 |
| CrontabViews | data/cronView.ts | TEMPORARY / RENAME CANDIDATE | task_views；不是 legacy-only 功能 |
| Apps | data/open.ts | REPLACE CANDIDATE | platform API clients；system token 暂供 Shell |
| Auths | data/system.ts | REPLACE CANDIDATE | 分离 admin/settings/notification/audit；4.5B 不必全拆 |
| SchemaMigrations | shared/schemaMigrations.ts | LEGACY CHAIN / REPLACE | platform_schema_version=1；以后只支持新平台版本升级 |

另有 `keyv.sqlite` 的 keyv 缓存/auth runtime；不是领域表，可由 DB 重新填充但运行期不能随意删除。notify.ts/sock.ts 是类型定义，不是 Notification/Sock 表。SQLite sqlite_sequence 为引擎内部表，不作为领域模型。

## Migration chain

当前 `loaders/db.ts` sync 九个旧 ORM 模型，再进入 migrateSchema 的单个 IMMEDIATE 事务：Git resources → Workspace → Managed Subscription → Scoped ENV → 17 条补列清单。ledger = 15 个旧 add-column + Phase 1（2 补列+1资源）+ Phase 2（1）+ Phase 3（1）+ Phase 4（1）=21。

4.5B 可把最终仍需的约束直接折叠进一次 fresh schema；不保留旧数据搬迁、PRAGMA 探测旧列、兼容 NULL 默认及默认 LEGACY。**不能在新 schema 未覆盖桥接模型之前删除 migration 文件：当前它们也创建所有新资源表。** 全量 Task/Schedule/Run 拆分只是目标，不能借 baseline 一步实施 Phase 9/10。

建议 4.5B operational baseline v1 暂保留 Crontab/RunningInstance/Dependences 等桥接表名，清理 Subscription/Global 列并建立新平台版本标记；未来平台自身 v1→v2 升级是允许的，不属于 QingLong migration。拒绝非空旧库并给出静态错误；fresh-only 不授权自动 DROP 用户数据。

## Fresh install 实际启动（源码追踪，非部署认证）

1. Docker entrypoint / native start → share.fix_config：先建 data/db、config、scripts、repo、raw、deps、log 等并复制样本/hooks/notify；依赖 Shell 与旧目录清单。
2. Backend config/index.ts 要求 root .env；Application.start primary → dbLoader → sync/migration；HTTP initFile 在 DB 之后运行，因此直接 Node 启动到完全空且无 db 父目录的数据根没有可靠 bootstrap 保证，可能 SQLITE_CANTOPEN。不要把 Docker 的 fix_config 当 Backend 自包含能力。
3. gRPC ready 后启动 HTTP；linkDeps 创建 HOME/bin/{ql,task}；initFile 复制配置与 preloads 通知 helpers。
4. initData 建 system App（crons/system/dashboard scopes）、Auths 配置、默认任务视图；无 auth 时可能读 auth.json，否则写 admin/admin 初始化状态。UserService/初始化接口随后控制正式设置。当前还有旧明文密码登录迁移。
5. initData 重置运行状态、查 ql repo/raw Task 并直接 exec，改写 2.11.3 以前路径；这两块及 auth.json 导入是明确 legacy-only 删除目标。
6. initData 依赖重装定时器/bootAfter、scheduler readiness 恢复、Global 三文件生成；initTask 建 token 周期任务、rmlog、全局 SSH 和订阅调度。空 DB 不意味着这些依赖消失。
7. git/worktrees 通常按显式初始化惰性创建；Phase 4 私有 ENV 根会尝试清理。没有默认 Repository/Task/Profile seed。

目标 bootstrap：创建目录→事务创建 operational baseline→标记 version=1→一次性安全 admin 初始化→缓存/调度投影；无网络和全局安装作为 schema bootstrap 副作用。Runtime 安装暂保留单独阶段。Gate：空目录、重启幂等、DDL 故障回滚、FK check、缺配置明确失败、旧非空 DB 拒绝、无默认可用密码、无启动 ql repo/raw。

## Task 字段分拆提案（不实施）

- Task：id/name/labels/enabled、source_kind、worktree_id/entrypoint/args/cwd、env_profile_id；command 暂作旧桥，最终改结构化输入。manual Task 可不属于 Subscription。
- Schedule：schedule/extra_schedules/once/boot、timezone/enabled；一 Task 多 Schedule，移除 saved（调度导出标记）。
- Source：sub_id→subscription_id、discovery_key、source_relative_path、definition_hash、user_overrides；不能用 command/name 当稳定 identity。
- TaskRun：status/pid/log_path/last_* 从定义中移出；run_id、task_id、schedule_id 可空、trigger、retry/attempt、exit_code、started_at/finished_at、runtime snapshot/reference、取消原因。queued_token 属 dispatch claim，不当作 task identity。
- task_before/after→Hooks Phase 5；isPinned→UI preference；log_name→展示策略，不是日志主键。allow_multiple_instances→Task concurrency policy。

当前 Crontab 已限制多 schedule/多 run/source identity，但它仍支撑所有执行；4.5B 不拆类。完整目标 ER/FK 见 architecture/06。
