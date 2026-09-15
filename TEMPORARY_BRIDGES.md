# Temporary Bridges — 退出条件登记

当前平台能力仍依赖以下桥。保留是对现有运行职责的承认，不是继续承诺 QingLong 兼容。新代码不得新增对桥内部文件、URL、命名规则的依赖。Phase 4.5B 已完成本阶段收敛；后续 phase 编号是计划，必须满足 gate 才能退场。

| ID / Component | Why still needed | Consumer / source | Planned replacement | Removal phase / exit gate |
| --- | --- | --- | --- | --- |
| B01 scripts staging | Task 实际执行副本；手工编辑混在其中 | ManagedSubscriptionService.stage；otask；ScriptService/api/script；Config editor；notify copy | Task.worktree_id/entrypoint + Runner lease + WorkspaceFileService | 9–12，最后编辑器/手工源消费者退场才删目录 |
| B02 task.sh/otask.sh | 语言/cwd/args/hooks/日志/status/信号 | CronService.makeCommand、runCron、system crond、ScriptService | Execution Engine | 10，所有触发路径真实exit/stop/timeout/log/env一致 |
| B03 crontab.list | 仅 system scheduler projection | CronService.setCrontab → system crond | DB → scheduler adapter | 4.5B 已移除 Discovery/无 ID 反读；10 评估 system adapter |
| B04 node-schedule/gRPC/queue adapters | 现任务与订阅周期、手工执行、恢复 | schedule/*、services/schedule、shared/pLimit/runCron/scheduler* | Task/Schedule/Execution dispatch | 9–10；核心调度语义继续保留，transport可替换 |
| B05 Global generated ENV — REMOVED | 无剩余消费者 | 已删除 generator、语言导入、全局文件复制及 export-line parser | Global 唯一 key + 每次执行 full snapshot 已生效 | 4.5B PASS：global-only/no-ID/四语言/UNSET/Secret/50 并发 |
| B06 language preload | hooks/QLAPI/全局包解析/账号选择/SIGTERM | sitecustomize.js/py、esm-loader.mjs、client.* | Hooks 5 + Runtime 6–8 + Runner/SDK 10 | 5–10；不能随B05整文件删除 |
| B07 explicit Discovery Adapter — REDUCED | 当前 Crontab publication 所需有限 metadata parser | SubscriptionDiscoveryAdapter；ManagedSubscriptionService.stage → CronService.publishSubscription | TaskDiscoveryService + Task v2 reconcile | 4.5B 已物理解耦 Git updater、改用 DB 投影与稳定 key；11 替换有限 parser |
| B08 Shell status/stat/token loopback | 真实exit/instance/stat写DB | share/api.sh→open/crons/status + dashboard/record；token.ts、system App | Runner controller结果IPC + Domain Services | 10；没有结果通道前不删 /open或system token |
| B09 dependency subsystem | 当前pnpm global/Python prefix安装供给 | DependenceService、util、Docker/start、node_path_cache | Runtime Env + explicit executable/lock | 6–8，现任务import/安装/取消/恢复通过 |
| B10 deps/dep_cache | 共享辅助源码与已安装包，非纯cache | support 文件、NODE_PATH/PYTHONPATH、Dependencies | Workspace内容 + Runtime environments/cache | 6–8/11；不得新增消费者 |
| B11 config.sh/before/after | 全局选项、可执行hook配置 | import_config、sitecustomize、taskCallbacks | Config Assets + Hooks v2 | 5；env/cwd/错误/阶段语义被明确承接 |
| B12 ql operations / share.sh | rmlog/check/reload/reset/启动+共同工具 | initTask、SystemService、entrypoint/start | 明确运维服务/启动工具 | 分段4.5B–14；不是删ql repo就删ql可执行文件 |
| B13 script notification SDK | 脚本 notify、QLAPI 与 Global store SDK bridge | sample/notify.*、preload/client.*、EnvService、复制到 scripts | 显式SDK + Notification events | 10/13；Backend NotificationService继续KEEP |
| B14 log identity | command/path/cron id 对应文件 | Cron/Subscription/task.sh/UI/retention | TaskRun / SyncRun ID | 10/13；保留drain、UTF8、边界与留存 |
| B15 Crontabs/RunningInstances/Stats | 目前定义/调度/状态模型 | ORM/services/API/UI/protobuf | Task/Schedule/TaskRun + aggregates | 9–10；4.5B fresh baseline保留桥表 |
| B16 backup/restore | 当前恢复入口及脚本文件备份 | SystemService export/import/reload、Settings、api/script | Backup v2 | 14；不能声称现有备份覆盖worktree独有数据 |

## 必须特别避免的误删

- generated `shell/preload/env.sh` ≠ `shell/env.sh`；`/api/env.js` 是前端配置。
- `data/scripts/` ≠ 源码根 `scripts/` 的构建工具。
- Fresh 不再创建 `data/repo/`、`data/raw/`；未删除任何既有用户目录。`git/` 可能保存本地唯一历史，永不视为无条件可删 cache。
- Discovery 已使用 DB 投影、稳定 identity 并直接调用 CronService；Runner 结果回环仍保留。

本表是后续开发的依赖约束。每次移除一个桥，要同时更新 consumers、替代测试和 [执行顺序](docs/refactor/phase4.5/10-cleanup-execution-order.md)。

## Phase 4.5B 最终状态

B05 已退出；B07 缩减为独立 Backend adapter；B03 仅为 scheduler 输出。B01/B02/B04/B06/B08–B16 保留，均有当前消费者和后续退出条件。

- B04：开机任务在 HTTP 内部结果通道就绪后触发；空订阅 schedule 不注册 cron。
- B09：安装由显式管理入口提供；启动仅取消中断操作，保留安装记录与日志。
- B12：不再有 repo/raw/bot CLI、旧路径转换、auth.json 导入或自动包安装。
- B06：preload 保留 hooks、SDK、账号选择、依赖查找和信号；不再加载 generated Global ENV。

验收与限制见 [最终报告](PHASE4_5B_REPORT.md)。Linux 实机 Gate 待 CI 执行，不影响已证明的本阶段代码收敛；不得将其写成 Linux PASS。
