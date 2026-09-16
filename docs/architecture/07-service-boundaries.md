# Service Boundaries

> **当前基线：Phase14 + Phase12 / schema v9。** Code Workspace 直接消费 Worktree，与 Execution/GitSync 复用 EX lease，与 Backup 复用平台 mutation barrier。当前结构见 [Code Workspace](19-code-workspace.md) 与 [Backup/Restore](18-backup-restore.md)；下列早期阶段段落为历史记录。后续顺序 Phase16A → Phase15 → Phase16B。

> **当前基线：Phase 13 / schema v9。** TaskRun观测、健康状态、Channel/Policy/Outbox/Delivery已生效。下方早期段落保留为历史记录；当前见 [Run Observability](16-task-run-observability.md)、[Notification Platform](17-notification-platform.md) 与 [Phase13报告](../../PHASE13_REPORT.md)。下一阶段固定为Phase14 Backup/Restore，Phase12暂缓。

> **当前基线：Phase 11 / schema v8。** Task 无 schedule 字段；TaskTriggers、TriggerEvents 与 DiscoveryPolicies 已生效。正常触发链为 Trigger → ExecutionService.submit → Phase 10 Runner。下文早期阶段内容为历史演进记录，以 [Discovery / Trigger 架构](15-discovery-triggers.md) 和 [Phase 11 报告](../../PHASE11_REPORT.md) 为当前约束。


> Phase 10 当前执行架构：Schema v7、TaskRuns / TaskRunAttempts、Worktree direct execution、immutable Context 与 Runner v2 已生效。下面保留的旧阶段描述不再定义正常执行路径。参见 [Execution Engine](14-execution-engine.md) 与 [当前桥接状态](../../TEMPORARY_BRIDGES.md#phase-10--execution-engine)。

> Phase 9 当前架构：Tasks 是定义事实来源；参见 [Task Domain](13-task-domain.md)。下文与此冲突的 Crontab 定义描述属于此前阶段，调度/结果桥仍按 TEMPORARY_BRIDGES 登记。


> **当前基线：Phase 8，schema v5。** Runtime Core 同时支持 Python 与 Node；Node 新增 exact PackageManagerToolchain、NodeEnvironment、不可变 Revision/Build，独立 node_modules 与共享 store。下文早期阶段描述保留为演进记录；当前结构见 [Node Runtime 架构](12-node-runtime-environments.md)，最新约束以该文档和 [Phase 8 schema](../refactor/phase8/10-schema-evolution.md) 为准。Task/Hook 仍使用现有 Runner Bridge，未实现 Phase 9/10 绑定。

| Service | Owns | Must not own |
| --- | --- | --- |
| CredentialService/Resolver | secret access、private auth transport | Task ENV、任务hook |
| RepositoryService/Storage | identity、bare store、refs/fetch、ownership | discovery metadata/parser、Task运行 |
| WorktreeService | workspace lifecycle/status/lease | scripts copy、shell command生成 |
| SubscriptionSyncService | sync orchestration、success watermark、recovery | credential override、旧URLclone |
| TaskDiscoveryService | 输入policy+workspace→definitions/diagnostics | 执行脚本、安装依赖、HTTP回环 |
| TaskService | stable source identity/reconcile/user overrides | 直接Git clone、解析crontab文本 |
| ScheduleService | schedule lifecycle/dispatch policy/recovery | Task定义真相、业务ENV生成 |
| EnvironmentResolver | pure immutable merge/preview | spawn、写全局文件、修改父环境 |
| Execution Engine | resolve context→spawn/signals/timeout/exit/log/lease | 重新选择credentials/修改Git资源 |
| NotificationService | events→providers | task path/alias身份、shared mutable request fields |
| WorkspaceFileService | boundary-checked code editing | 任意config/secret文件写入 |

目标依赖单向：Domain DB→Projection/Runner；Runner result→TaskRun持久化，不反向修改Task定义。进程间消息需要显式认证/类型/幂等处理；“direct service call”只在Backend同进程可用。旧Shell→OpenAPI是可替换IPC，不应简单关闭导致真实退出状态丢失。

4.5B保留CronService+scheduler transport与TaskShellBridge，按[桥登记](../../TEMPORARY_BRIDGES.md)封装，禁止新模块继续依赖其路径与文本格式。

## Phase 4.5B 实际服务映射

SubscriptionSync 由唯一 `ManagedSubscriptionService` 承担；Discovery 是 `SubscriptionDiscoveryAdapter`；Task publication 暂由 `CronService.publishSubscription` 直接调用，输入来自 DB，保留 scheduler/filesystem 补偿；`TaskEnvironmentResolver` + `ExecutionEnvironmentTransport` 提供每次执行 full snapshot。表内 Execution Engine/TaskService/ScheduleService 是后续领域目标，不表示本阶段新增这些模型。

## Phase 5 实际服务映射

ConfigAssetService 持有不可变存储；TaskConfigService 合并绑定与预览；TaskHookService 管理结构化计划；TaskExecutionPreparationService 在同一 DB 事务解析计划；TaskWorkspaceResolver 持有 B17 映射；ConfigMaterializationService 负责租约内注入/恢复；TaskHookLifecycle 与 HookExecutor 监督 Hook 并调用当前 MAIN bridge。Config API 不再拥有通用系统文件编辑权。

## Phase 6 Runtime boundary

RuntimeOperationService 持有资源状态机、DB 事务、租约、取消与恢复；PyenvProvider 持有 pinned source/definitions/build/verify；RuntimePathResolver 持有所有权/路径；RuntimeDiagnosticsService 检查工具/空间，RuntimeReferenceService 提供未来引用扩展点。API 注册恢复，不在 Backend 启动执行 Python/build/network。

仅 RuntimeCommand 复用通用 childProcess + hook_process.py/process_group.py。它不调用 HookExecutor、TaskEnvironmentResolver、TaskExecutionPreparation、Config lease、Repository Credential 或 DependenceService。

## Phase 7 Python Environment services

PythonEnvironmentService 负责定义/乐观版本；PythonEnvironmentBuildService 作为 RuntimeOperation 的资源执行扩展；PythonDependencyService 调标准 parser；PythonVenvManager/PipPackageManager 处理绝对 executable argv；PathResolver 负责所有权；Resolver 返回 snapshot + lease；RuntimeReferenceSource 保护解释器。均不依赖当前 Task staging/全局依赖/Config 注入。
