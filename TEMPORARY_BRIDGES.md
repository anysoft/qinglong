# Temporary Bridges — 退出条件登记

当前平台能力仍依赖以下桥。保留是对现有运行职责的承认，不是继续承诺 QingLong 兼容。新代码不得新增对桥内部文件、URL、命名规则的依赖。Phase 4.5A 仅记录；phase 编号是计划，必须满足 gate 才能退场。

| ID / Component | Why still needed | Consumer / source | Planned replacement | Removal phase / exit gate |
| --- | --- | --- | --- | --- |
| B01 scripts staging | Task 实际执行副本；手工编辑混在其中 | Managed.stage；otask；ScriptService/api/script；Config editor；notify copy | Task.worktree_id/entrypoint + Runner lease + WorkspaceFileService | 9–12，最后编辑器/手工源消费者退场才删目录 |
| B02 task.sh/otask.sh | 语言/cwd/args/hooks/日志/status/信号 | CronService.makeCommand、runCron、system crond、ScriptService | Execution Engine | 10，所有触发路径真实exit/stop/timeout/log/env一致 |
| B03 crontab.list | system scheduler output + scanner/无ID反查 | setCrontab；Managed.stage；update.sh；task.handle_log_path | DB snapshot → scheduler adapter | 4.5B 去反读；10 再去 system adapter（若目标统一） |
| B04 node-schedule/gRPC/queue adapters | 现任务与订阅周期、手工执行、恢复 | schedule/*、services/schedule、shared/pLimit/runCron/scheduler* | Task/Schedule/Execution dispatch | 9–10；核心调度语义继续保留，transport可替换 |
| B05 Global generated ENV | snapshot只传overlay；全局值仍按语言文件导入 | EnvService、transport.prepare、preload、otask | Global唯一key + full child environment | 4.5B 条件：global-only/no-ID/三语言/UNSET/Secret全部通过 |
| B06 language preload | hooks/QLAPI/全局包解析/账号选择/SIGTERM | sitecustomize.js/py、esm-loader.mjs、client.* | Hooks 5 + Runtime 6–8 + Runner/SDK 10 | 5–10；不能随B05整文件删除 |
| B07 legacy discovery implementation | Managed仍source原函数 | managed_discovery.sh→update.sh scanner | 独立 adapter；TaskDiscoveryService | 4.5B 抽库；11 新parser/reconcile |
| B08 Shell status/stat/token loopback | 真实exit/instance/stat写DB | share/api.sh→open/crons/status + dashboard/record；token.ts、system App | Runner controller结果IPC + Domain Services | 10；没有结果通道前不删 /open或system token |
| B09 dependency subsystem | 当前pnpm global/Python prefix安装供给 | DependenceService、util、Docker/start、node_path_cache | Runtime Env + explicit executable/lock | 6–8，现任务import/安装/取消/恢复通过 |
| B10 deps/dep_cache | 共享辅助源码与已安装包，非纯cache | scanner、NODE_PATH/PYTHONPATH、Dependencies | Workspace内容 + Runtime environments/cache | 6–8/11；不得新增消费者 |
| B11 config.sh/before/after | 全局选项、可执行hook配置 | import_config、sitecustomize、taskCallbacks | Config Assets + Hooks v2 | 5；env/cwd/错误/阶段语义被明确承接 |
| B12 ql operations / share.sh | rmlog/check/reload/reset/启动+共同工具 | initTask、SystemService、entrypoint/start | 明确运维服务/启动工具 | 分段4.5B–14；不是删ql repo就删ql可执行文件 |
| B13 script notification SDK | 脚本notify与QLAPI对象 | sample/notify.*、preload/client.*、复制到scripts | 显式SDK + Notification events | 10/13；Backend NotificationService继续KEEP |
| B14 log identity | command/path/alias/cron id对应文件 | Cron/Subscription/task.sh/UI/retention | TaskRun / SyncRun ID | 10/13；保留drain、UTF8、边界与留存 |
| B15 Crontabs/RunningInstances/Stats | 目前定义/调度/状态模型 | ORM/services/API/UI/protobuf | Task/Schedule/TaskRun + aggregates | 9–10；4.5B fresh baseline保留桥表 |
| B16 backup/restore | 当前恢复入口及脚本文件备份 | SystemService export/import/reload、Settings、api/script | Backup v2 | 14；不能声称现有备份覆盖worktree独有数据 |

## 必须特别避免的误删

- generated `shell/preload/env.sh` ≠ `shell/env.sh`；`/api/env.js` 是前端配置。
- `data/scripts/` ≠ 源码根 `scripts/` 的构建工具。
- `data/repo/` 可在旧 source 与 bot 移除后退场；`git/` 可能保存本地唯一历史，永不视为无条件可删 cache。
- Managed 发布已直接调用 CronService，仍需替换的是 scanner输入/身份与Runner结果回环。

本表是后续开发的依赖约束。每次移除一个桥，要同时更新 consumers、替代测试和 [执行顺序](docs/refactor/phase4.5/10-cleanup-execution-order.md)。
