# 当前运行依赖图 / 删除影响

实线为当前已确认调用或数据消费；虚线为未来替代。不是目标图伪装现状。

```mermaid
flowchart TD
 API[Subscription API / scheduler] --> SS[SubscriptionService]
 SS --> ID[gitSubscription ID helper]
 SS --> OLD[formatUrl / ql repo or raw]
 ID --> M[ManagedSubscriptionService]
 ID --> OLD
 M --> C[SubscriptionGitResolver]
 C --> CREDS[GitCredentialResolver]
 M --> RS[RepositoryStorage]
 RS --> LOCK[WorkspaceLocks / supervisor]
 RS --> GIT[GitCommand argv runner]
 M --> WT[WorktreeService FF + status]
 WT --> LOCK
 M --> STAGE[stage scripts + crontab.list]
 STAGE --> SCAN[managed_discovery source update.sh scanner]
 OLD --> CLONE[rm repo + shallow clone / raw download]
 CLONE --> SCANOLD[update.sh scanner]
 SCANOLD --> HTTP[Shell api.sh /open/crons]
 HTTP --> CRON[CronService]
 SCAN --> PLAN[JSONL add/drop plan]
 PLAN --> CRON
 CRON --> DB[(Crontabs)]
 CRON --> FILE[crontab.list]
 FILE --> STAGE
 FILE --> SCANOLD
 CRON --> SCH[gRPC / node-schedule / manual queue / crond]
 SCH --> TASK[task.sh / otask.sh]
 SCRIPT[Script editor .swap run] --> TASK
 TASK --> SCRIPTS[data/scripts + cwd]
 TASK --> ENV[taskEnvironment resolver + private snapshot]
 ENV --> GLOBAL[generated env.sh / env.js / env.py copies]
 TASK --> PRE[language preload / hooks / dependency paths]
 PRE --> GLOBAL
 TASK --> RESULT[api.sh status/stat + token]
 RESULT --> DB
 DEPS[data/deps + dep_cache] --> PRE
 DEPS --> SCAN
 BOT[Docker/native optional ql bot] --> CLONE
 WT -. Task binding + lease Phase9/10 .-> TASK
```

| 删除 A | 直接破坏 B/C/D | 当前证据 |
| --- | --- | --- |
| update.sh whole | Managed scanner、ql ops、Legacy source | managed_discovery.sh:25–26；initTask/SystemService/CLI |
| subscriptionGit whole | Managed credential/ref prepare、stage prefix、convert | managedSubscription.ts:6/36/223 |
| crontab.list | scanner存在性、无ID Task反查、system cron投影 | cron.setCrontab；Managed.stage；task.handle_log_path |
| data/scripts copy | Task cwd/entrypoint、Script API编辑运行、notification/deps | otask.enter_script_workdir；api/script.ts:319；gen_list_repo |
| env generated files | transport.prepare直接read、global-only语言import | executionEnvironmentTransport.ts；sitecustomize.* |
| preloads whole | hooks、SDK、global module lookup、signal | sitecustomize.* run与顶部加载 |
| /open rewrite / system token | Task真实状态/统计/CLI通知/管理员恢复 | api.sh update_cron/record_cron_stat/notify/update_auth |
| deps/dep_cache | 当前可见包与共享辅助文件 | getInstallCommand、node_path_cache、scanner |
| migration chain before fresh bootstrap | 新Git/Worktree/Scoped表不再被创建 | loaders/db仅sync九旧模型；migrateSchema创建新表 |

锁是资源控制边界，不是线程级装饰。Task目前没有Worktree lease，未来接入需绑定子进程生存期。平台构建Git clone与上图业务获取分开。
