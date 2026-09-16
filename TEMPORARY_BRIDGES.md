# Temporary Bridges — 退出条件登记

> 当前状态以本文末尾 **Phase 12 — Code Workspace** 及其明确沿用的 Phase 13/14 职责为准；前面的表保留为阶段记录。

当前平台能力仍依赖以下桥。保留是对现有运行职责的承认，不是继续承诺 QingLong 兼容。新代码不得新增对桥内部文件、URL、命名规则的依赖。Phase 4.5B 已完成本阶段收敛；后续 phase 编号是计划，必须满足 gate 才能退场。

| ID / Component | Why still needed | Consumer / source | Planned replacement | Removal phase / exit gate |
| --- | --- | --- | --- | --- |
| B01 scripts staging | Task 实际执行副本；手工编辑混在其中 | ManagedSubscriptionService.stage；otask；ScriptService/api/script；notify copy | Task.worktree_id/entrypoint + Runner lease + WorkspaceFileService | 9–12，最后编辑器/手工源消费者退场才删目录 |
| B02 task.sh/otask.sh | 语言/cwd/args/日志/status/信号；外层接 Hooks v2 | CronService.makeCommand、runCron、system crond、ScriptService | Execution Engine | 10，所有触发路径真实exit/stop/timeout/log/env一致 |
| B03 crontab.list | 仅 system scheduler projection | CronService.setCrontab → system crond | DB → scheduler adapter | 4.5B 已移除 Discovery/无 ID 反读；10 评估 system adapter |
| B04 node-schedule/gRPC/queue adapters | 现任务与订阅周期、手工执行、恢复 | schedule/*、services/schedule、shared/pLimit/runCron/scheduler* | Task/Schedule/Execution dispatch | 9–10；核心调度语义继续保留，transport可替换 |
| B05 Global generated ENV — REMOVED | 无剩余消费者 | 已删除 generator、语言导入、全局文件复制及 export-line parser | Global 唯一 key + 每次执行 full snapshot 已生效 | 4.5B PASS：global-only/no-ID/四语言/UNSET/Secret/50 并发 |
| B06 language preload — REDUCED | QLAPI/全局包解析/账号选择/SIGTERM | sitecustomize.js/py、esm-loader.mjs、client.* | Hooks 部分 Phase 5 已删除；Runtime 6–8 + Runner/SDK 10 | 5–10；不能随B05整文件删除 |
| B07 explicit Discovery Adapter — REDUCED | 当前 Crontab publication 所需有限 metadata parser | SubscriptionDiscoveryAdapter；ManagedSubscriptionService.stage → CronService.publishSubscription | TaskDiscoveryService + Task v2 reconcile | 4.5B 已物理解耦 Git updater、改用 DB 投影与稳定 key；11 替换有限 parser |
| B08 Shell status/stat/token loopback | 真实exit/instance/stat写DB | share/api.sh→open/crons/status + dashboard/record；token.ts、system App | Runner controller结果IPC + Domain Services | 10；没有结果通道前不删 /open或system token |
| B09 dependency subsystem | 当前pnpm global/Python prefix安装供给 | DependenceService、util、Docker/start、node_path_cache | Runtime Env + explicit executable/lock | 6–8，现任务import/安装/取消/恢复通过 |
| B10 deps/dep_cache | 共享辅助源码与已安装包，非纯cache | support 文件、NODE_PATH/PYTHONPATH、Dependencies | Workspace内容 + Runtime environments/cache | 6–8/11；不得新增消费者 |
| B11 platform-internal Settings — SHARPLY REDUCED | config.sh 内部运行选项；不再是用户 Config/Hook 接口 | import_config、Settings/SystemService | 显式平台选项存储/运维服务 | 后续 Settings/Runner gate；Phase 5 已删除公共 Config editor/API、旧 before/after 与 ENV 回传 |
| B12 ql operations / share.sh | rmlog/check/reload/reset/启动+共同工具 | initTask、SystemService、entrypoint/start | 明确运维服务/启动工具 | 分段4.5B–14；不是删ql repo就删ql可执行文件 |
| B13 script notification SDK | 脚本 notify、QLAPI 与 Global store SDK bridge | sample/notify.*、preload/client.*、EnvService、复制到 scripts | 显式SDK + Notification events | 10/13；Backend NotificationService继续KEEP |
| B14 log identity | command/path/cron id 对应文件 | Cron/Subscription/task.sh/UI/retention | TaskRun / SyncRun ID | 10/13；保留drain、UTF8、边界与留存 |
| B15 Crontabs/RunningInstances/Stats | 目前定义/调度/状态模型 | ORM/services/API/UI/protobuf | Task/Schedule/TaskRun + aggregates | 9–10；4.5B fresh baseline保留桥表 |
| B16 backup/restore | 旧完整平台入口已退出；单文件编辑保护保留 | 新 Backup/Restore domain；api/script 内部 bak | Backup v2 已接入 | Phase14 末尾记录退出证据 |

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
- B06：preload 保留 SDK、账号选择、依赖查找和信号；不再加载 generated Global ENV。

验收与限制见 [最终报告](PHASE4_5B_REPORT.md)。Linux 实机 Gate 待 CI 执行，不影响已证明的本阶段代码收敛；不得将其写成 Linux PASS。

## Phase 5 收敛

| ID | 当前职责 | Consumer | 退出条件 |
| --- | --- | --- | --- |
| B17 TaskWorkspaceResolver / ConfigMaterializationLease | 映射当前 scripts source、逻辑根/cwd/锁键；租约覆盖配置完整生命周期；阻止 Script API 读取执行副本 | ExecutionPreparation、ConfigMaterialization、current Task bridge | Phase 9/10 ExecutionContext + Worktree direct execution 通过全部触发、隔离、恢复 gates 后替换 |

旧 Config UI/API、Task before/after 字段、Subscription before/after、preload hook 与 `/tmp/env_PID` 回传已由新模型替代并删除。保留 B01/B02/B03/B04/B06 SDK+依赖+账号+信号/B08–B10/B11 内部选项/B12–B16；B05 不恢复。现行证据见 [Phase 5 报告](PHASE5_REPORT.md)，4.5B 报告保持历史记录。

## Phase 6 复核

- B02、B06 当前 Python 查找/preload、B09 dependency subsystem、B10 deps/dep_cache 继续 **TEMPORARY**；解释器资源不能替代包环境或 Task Binding。退出仍依赖 Phase 7/8/9/10 对应 gates。
- B17、Config snapshot、Hook lifecycle、工作区与 materialization lease 不变；Runtime 不获取这些锁。
- 未新增 Task bridge。Runtime Manager 的 `shell/runtime_lease.py` 是平台 FD/flock helper，唯一消费者 RuntimeLease；复用 `hook_process.py`/`process_group.py` 仅为通用进程组监督。当前 Node 缺少项目内 POSIX flock 接口，故由固定 `/usr/bin/python3 -I -S` 持锁；在 Phase 10 通用 process/lease supervisor 整合时评估退出，替代前必须通过跨进程、SIGKILL、PID reuse、cancel/timeout/drain gates。它不是 managed Runtime，也不改变 Backend/Task Python。
- B09/B10 未删除、未新增 Runtime 消费者；B05 不恢复。现行证据见 [Phase 6 报告](PHASE6_REPORT.md)。

## Phase 7 review — Python Environment

- **Legacy Python Dependency Bridge: RETAINED**。新 Python Environment 已具备 isolated venv、Desired/Resolved、immutable Build、pip cache、operations 和真实引用，但当前 Task 仍通过 B02/B06/B09/B10 导入旧 package prefix/support paths。
- 已确认消费者：`shell/start.sh` 的 Python prefix/PYTHONPATH/requests bootstrap；`shell/preload/sitecustomize.py` 的当前 Task 搜索路径；`back/config/util.ts` 与 DependenceService 的安装/卸载；`back/services/system.ts` 的旧 Python mirror 设置。Node/Linux 依赖继续保留。
- 这些旧入口不被新 Environment 使用。第一版固定 PyPI 且 PIP_CONFIG_FILE=/dev/null，新 pip 环境不会继承旧 mirror/Task ENV/Config。
- B09/B10 Python 退出条件调整为：Phase 9 显式 Task resource binding、Phase 10 execution snapshot/absolute executable + package/SDK import、取消/恢复/三语言 release gates 通过后移除。不能在 Phase 7 自动绑定默认 Environment 来换取删除。
- B05 保持 REMOVED；其他活跃 bridge 保留既有责任。没有新增 Task Runtime bridge。
- `runtime_lease.py` 继续作为 POSIX lease helper，新增 Environment/Build shared/exclusive 使用；Provider FD 仍由当前 supervisor 传递。最终整合由 Phase 10 通用监督器完成，不能提前删除。
- **Shared Package Layer: DEFERRED**。只共享 pip artifact cache，不共享 mutable site-packages。


## Phase 8 — Node Runtime / Environment 边界核查

**B09/B10：RETAINED UNTIL PHASE 9/10。** 新 Node Environment 全部使用 private Toolchain、Build node_modules 与 cache；没有新增旧全局依赖消费者。现有 Runner 的执行职责尚未替换，不能仅因新安装功能存在而删桥。

| 实际 consumer | 仍承担的职责 | 退出条件 |
|---|---|---|
| `back/config/util.ts`、`DependenceService` | 当前全局 Node 依赖查询/安装/删除 | Task 资源绑定、执行替换与依赖 UI 拆分通过 |
| `shell/start.sh`、`shell/check.sh` | 平台 bootstrap、全局工具检查/修复 | 平台工具与任务依赖拆分 |
| `shell/share.sh` | NODE_PATH、npm_install_sub、当前脚本运行 | Phase 9/10 Runner 消费 Environment Resolver |
| `shell/preload/sitecustomize.js`、`esm-loader.mjs` | 当前模块搜索路径 | managed Build 模块解析接管且旧 Task 回归通过 |
| Docker、shell/lang | 平台 Node/pm2/ts-node 和 bootstrap 提示 | 单独审计平台工具职责，不作为业务 Runtime |

Python dependency bridge 同样保留既有当前 Runner consumer；Linux packages 不属于 Node 清理授权。B05 已移除，B01–B04、B06–B17 的其余退出条件沿用当前登记。本阶段无自动 Task/Repository package.json/lockfile 绑定，无 NODE_PATH 新核心设计。静态证据：`diagnostics/phase8/final-static-audit.json`。


## Phase 9 — Task Domain 合流

本节是以下 Bridge 的当前状态，覆盖前面阶段记录中“Crontab 为定义”的描述。

| Bridge | 状态 | 当前消费者与退出条件 |
|---|---|---|
| B01 scripts staging | TEMPORARY | TaskExecutionSourceBridge → 已发布 subscription namespace；Phase 10 Worktree direct execution 完成后替换；Editor 消费者另行退出 |
| B02 task.sh / otask.sh | TEMPORARY | CurrentTaskBridgeService 与原 Runner；Phase 10 统一执行解析后替换 |
| B03 system crontab | TEMPORARY | SchedulerBridgeService 的派生输出，禁止反向恢复 Task |
| B04 scheduler adapters | TEMPORARY | node/gRPC/protobuf transport，Phase 10/11 退出 |
| B06 preload | TEMPORARY | 当前 Shell/语言 Runner 注入与 SDK transport；Phase 10 新 Runner 接管后再退出 |
| B09/B10 dependency bridges | TEMPORARY | 当前 Runner 仍消费全局依赖布局；Task 已绑定 Environment 不代表执行已切换，须等待 Phase 10 实际 Build/lease 执行 gates |
| B07 discovery adapter | REDUCED | 现有发现 plan → TaskService 定义协调 → SchedulerProjection，Phase 11 替换 |
| B08 results | TEMPORARY | 保留 `/crons/status`、`/crons/detail` 和 cron_id wire 属性；RunningInstances 物理 task_id；Phase 10 替换 |
| B14 logs identity | TEMPORARY | 保留原 Task ID、日志路径与历史记录；删除 Task 不删除日志 |
| B15 Crontab domain | REMOVED（定义职责） | Tasks + TaskSource + RuntimeBinding + Settings 为唯一领域定义。SchedulerProjections 仅临时输出，CurrentTaskBridgeService 保留原调度/执行实现，分别由窄 SchedulerBridgeService / TaskExecutionBridge 接入 |
| B17 TaskWorkspaceResolver | REDUCED | Task 使用 canonical TaskSource 经 SourceBridge 映射当前 staging；ConfigMaterializationLease / 恢复继续保留；Phase 10 完成 workspace lease 后退出 |

Runtime Binding 和 Settings 在 Phase 9 只声明、验证、展示。没有 managed Environment 实际 Task 执行，没有 ExecutionContext v2。非空 structured arguments 在当前桥执行时明确拒绝，Phase 10 使用原生 argv。未发布 Manual source 可保存与校验，当前桥无法直接执行。


## Phase 10 — Execution Engine

本节覆盖前面的旧执行消费者登记。详细拆分见 [Phase 10 bridge report](docs/refactor/phase10/11-bridge-removal.md)。

| ID | 当前状态 | 仍保留的职责 / 下一退出 gate |
|---|---|---|
| B01 | REDUCED | Runner 不再 staging；订阅发布、编辑器和辅助文件仍消费 scripts，Phase 11/12 处理 |
| B02 | DISABLED / BLOCKED_BY_LINUX_GATE | task.sh、otask.sh、旧 taskExecution 仅显式恢复诊断可运行；手工/API/node-schedule/crond 全部提交 Task ID |
| B03 | REDUCED | 仅输出受保护本地 launcher，无 Task command/Secret，不是领域定义 |
| B04 | REDUCED | 定时 transport 保留；SQLite dispatcher + owner lease 承担执行 claim/queue |
| B06 | DISABLED FOR NORMAL TASKS | Runner v2 无 preload、SDK/账号/语言路径魔法；历史诊断/显式 SDK 源码保留，Linux gate 后删除最后 execution glue |
| B08 | REMOVED FROM NORMAL EXECUTION | 结果由 supervisor result FD → TaskRun；旧 status/stat/token transport 不驱动新执行；stopInstance 不再按数据库 PID 发信号 |
| B09/B10 | REDUCED | Python venv / Node Build 替代 Task 依赖；旧管理/平台 bootstrap/Linux 包/恢复材料保留，没有删除 deps 用户数据 |
| B13 | RETAINED | 显式脚本通知 SDK 后续 Phase 13；Backend NotificationService 当前由最终 ExecutionResult 调用 |
| B14 | REPLACED FOR TASK RUNS | data/log/task-runs/run-ID.log；历史/订阅日志继续保留 |
| B15 | REDUCED | TaskRun/Attempt 取代活跃 RunningInstances；历史 dashboard/DTO/projection 表保留 |
| B17 | REPLACED FOR TASK RUNS | ExecutionPaths + Worktree lease 取代 scripts workspace；ConfigMaterialization 与 Hook lifecycle 继续作为共享安全核心 |

**KEEP**：Config journal、runtime_lease.py、hook_process.py、process_group.py、已有 Runtime/Build shared/exclusive lease、后台通知服务。新核心没有新增 Shell→Open API、generated ENV、global dependencies 或 scripts staging 消费者。

**Linux**：本机 Darwin，Step 0 未发现容器/VM/远程 CI runner。最后 destructive removal 为 BLOCKED_BY_LINUX_GATE。已更新 Linux CI 验收步骤，但未把配置文件当作已运行证据。未删除既有用户数据。

## Phase 11 — Discovery / Triggers

| Bridge | 状态 | 当前消费者 / 退出条件 |
| --- | --- | --- |
| B03 crontab.list | NORMAL TASK PATH REMOVED；物理清理 BLOCKED_BY_LINUX_GATE | Task CRUD、启动、Discovery、Cron Trigger 不再读写或安装系统 crontab。历史适配代码留待 Linux 验证后删除 |
| B04 node-schedule / gRPC | REDUCED | Task TriggerScheduler 使用数据库与单循环。Subscription 周期同步、系统 token/log 运维仍由 ScheduleService 承担；健康检查只探测真实 transport |
| B07 staging discovery adapter | REMOVED | 删除 SubscriptionDiscoveryAdapter 与 ManagedSubscription.stage、TaskService.reconcileDiscoveredTasks。DiscoveryService 直接 Worktree → Task + CronTrigger 单事务 |
| B15 SchedulerProjection | NORMAL TASK PATH REMOVED；历史表 RETAINED | Task save/clone/sync 不生成投影。保留旧 API、统计、恢复记录，不从其反向恢复 Task |
| B01 scripts/editor | RETAINED | 当前脚本编辑器与非 Worktree 历史源；没有新增 Discovery 消费者，不删除用户目录 |
| B09 / B10 dependencies/bootstrap | RETAINED | Linux/bootstrap/package 遗留职责，不属于本阶段物理删除授权 |
| B14 logs | REDUCED / RETAINED | 新结果使用 TaskRun；旧日志查询和留存仍有消费者 |

B02/B06/B08/B11/B12/B13/B16/B17 的既有保留责任和 Linux gate 沿用 Phase 10，不因 Trigger 上线误删。Fresh Cron / Webhook / Git Trigger 不需要 system crond。没有启动 Phase 12 编辑器工作。


## Phase 13 — Observability / Notifications

| Bridge | Consumer | Replacement / Status | Exit condition |
|---|---|---|---|
| B14 Task日志身份 | Task行日志、Run History、Runs详情、Live follow | **REMOVED FROM NORMAL TASK PATH**；统一Run ID + RunLogService cursor，旧Task日志API不再是事实源 | 已通过正式Run读取/脱敏/大日志/断线/浏览器gate；不删除历史文件 |
| B14 非Task旧日志与留存 | Subscription同步日志、系统日志、旧LogService/API、rmlog | **REDUCED / RETAINED**；旧API和清理器明确排除task-runs | Sync/System各自独立日志域与显式保留策略通过后才移除剩余旧接口 |
| B13 最终执行通知 | 原ExecutionService→NotificationService | **REMOVED FROM EXECUTION PATH**；terminal SQL→Outbox→Dispatcher | 已由异步投递、失败不改结果、真实HTTP/崩溃恢复替代 |
| B13 显式脚本SDK / 登录系统通知 | sample/notify、SystemService.notify、UserService登录通知、旧Auths内部配置 | **REDUCED / RETAINED**；保留显式SDK/system alert，无新Task消费者 | 系统/SDK事件契约替代后退出；旧初始化通知步骤与无消费者的旧通知表单已删除，旧配置公开编辑已关闭，Channel成为产品管理入口；不声称SDK已自动迁移 |
| B15 统计/视图 | 旧TaskStats/TaskViews API及历史恢复数据 | **REDUCED**；Dashboard、Task最新状态、统计由TaskRuns SQL承担 | 历史consumer清点与Linux最终收敛后再删旧表/API，不删除用户历史 |
| B16 Backup | 既有System export/import | **RETAINED**；不承诺覆盖新观测与通知域 | Phase14正式一致备份/恢复通过；本阶段未实现 |

B03/B04/B07沿用Phase11状态；本阶段未重构Trigger/Scheduler。B01/B02/B06/B08/B09/B10/B11/B12/B17沿用各自活跃责任。B05保持REMOVED。Linux final qualification统一Phase15，不以Darwin通过冒充Linux通过。

## Phase 14 — Backup / Restore Production Integration

| Bridge | Old consumers | Replacement / Status | Exit evidence |
|---|---|---|---|
| B16 Normal Platform Backup / Restore | SystemService exportData/importData/reloadSystem(data)、Settings Other 旧上传/下载、旧 system/data routes、Shell reload data | **REMOVED FROM NORMAL PATH**；BackupCoordinator / BackupValidator / BackupOperations、RestoreService / RuntimeRestoreReconciler / RestoreRebuildService、Panel Backup & Restore、offline CLI/startup bootstrap | 全组件一致 snapshot、加密导出/导入、七点 SIGKILL、跨根 Git repair、真实 A 删除后 B 恢复、显式 managed rebuild、Task/Trigger/Notification 全链 Browser E2E PASS；旧 API 410、Shell 64 在修改数据前拒绝 |
| B16 internal file-edit safety copy | api/script → data/bak 单文件副本 | **RETAINED INTERNAL DATA PROTECTION**；不是完整平台 Backup，也不提供旧 tar restore | 新快照默认保留这些用户副本；编辑器替代归 Phase 12，不能以 Backup 清理为由提前删除 |

B13/B14 沿用 Phase 13 状态与责任。B01/B02/B03/B04/B06/B07/B08/B09/B10/B11/B12/B17 沿用既有责任；B05 保持 REMOVED。没有新建兼容桥，没有删除用户唯一数据。

当前完整备份的用户入口只指向新 Backup domain。具体 production entrypoints、锁/日志/秘密/物理资源政策、测试与 Linux Phase 15 待验项见 [Phase14 最终报告](PHASE14_REPORT.md) 与 [Backup/Restore 架构](docs/architecture/18-backup-restore.md)。

## Phase 12 — Code Workspace

| Bridge | 当前职责 / 处置 | 保留边界 |
|---|---|---|
| B01 Editor / scripts staging | **EDITOR REMOVED FROM NORMAL PATH**；Code Workspace 直接使用 canonical Worktree；旧 Script UI/API/ScriptService 文件访问退出 | ManagedSubscription.stage/publication 已在Phase11删除；B17 disabled recovery映射、B13 SDK/bootstrap材料仍保留其独立诊断职责。不是新的编辑器依赖，不删除用户scripts目录 |
| B16 internal file-edit bak | **EDITOR CONSUMER REMOVED**；保存不再生成 data/bak 副本 | 原有bak文件继续由Phase14完整快照保存，不删除用户数据 |
| B14 logs | **UNCHANGED / RETAINED**；旧系统/订阅日志API和留存 | 不作为文件编辑器，不移除现有日志保护 |
| Phase14 platform barrier | **REUSED**；所有Workspace mutations持shared FD，snapshot排他等待 | RESTORE_PENDING阻止Save/Create/Delete/Commit/Push，Git/rename子进程继承租约 |

旧 `/scripts` 路由统一410 CODE_WORKSPACE_REQUIRED；旧 `/script` 页面只指向新入口。Workspace不依赖api/script、generated ENV、global dependencies或Shell→Open API。独立Linux残余材料清理仍归Phase15。验收见[Phase12报告](PHASE12_REPORT.md)。

## Phase 15 — final source/ownership disposition

**Temporary remaining = 0.** The earlier entries above are historical records.
This statement is the source/domain ownership exit, not a claim that hosted Linux
qualification has passed. See [Phase15 report](PHASE15_REPORT.md) for the separate
local and GitHub gates, and the [17-item final matrix](docs/refactor/phase15/05-bridge-finalization.md)
for physical removals, retained owners and evidence.

B01/B02/B03/B05/B06/B07/B08/B09/B10/B12/B15/B16 are physically removed from the
current source contracts. B04/B11/B13/B14/B17 are formal internal responsibilities
with dedicated owners and tests. The private environment.sh writer and its bootstrap
cleanup are also removed. Existing user files and schema v9 historical storage remain
intact. Docker deployment templates require the separately authorized Phase16B review.
