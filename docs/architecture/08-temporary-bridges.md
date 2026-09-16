# Temporary Bridges / 当前与目标之间的约束

> **当前基线：Phase 13 / schema v9。** TaskRun观测、健康状态、Channel/Policy/Outbox/Delivery已生效。下方早期段落保留为历史记录；当前见 [Run Observability](16-task-run-observability.md)、[Notification Platform](17-notification-platform.md) 与 [Phase13报告](../../PHASE13_REPORT.md)。下一阶段固定为Phase14 Backup/Restore，Phase12暂缓。

> **当前基线：Phase 11 / schema v8。** Task 无 schedule 字段；TaskTriggers、TriggerEvents 与 DiscoveryPolicies 已生效。正常触发链为 Trigger → ExecutionService.submit → Phase 10 Runner。下文早期阶段内容为历史演进记录，以 [Discovery / Trigger 架构](15-discovery-triggers.md) 和 [Phase 11 报告](../../PHASE11_REPORT.md) 为当前约束。


> Phase 10 当前执行架构：Schema v7、TaskRuns / TaskRunAttempts、Worktree direct execution、immutable Context 与 Runner v2 已生效。下面保留的旧阶段描述不再定义正常执行路径。参见 [Execution Engine](14-execution-engine.md) 与 [当前桥接状态](../../TEMPORARY_BRIDGES.md#phase-10--execution-engine)。

> Phase 9 当前架构：Tasks 是定义事实来源；参见 [Task Domain](13-task-domain.md)。下文与此冲突的 Crontab 定义描述属于此前阶段，调度/结果桥仍按 TEMPORARY_BRIDGES 登记。


> **当前基线：Phase 8，schema v5。** Runtime Core 同时支持 Python 与 Node；Node 新增 exact PackageManagerToolchain、NodeEnvironment、不可变 Revision/Build，独立 node_modules 与共享 store。下文早期阶段描述保留为演进记录；当前结构见 [Node Runtime 架构](12-node-runtime-environments.md)，最新约束以该文档和 [Phase 8 schema](../refactor/phase8/10-schema-evolution.md) 为准。Task/Hook 仍使用现有 Runner Bridge，未实现 Phase 9/10 绑定。

权威清单：[TEMPORARY_BRIDGES.md](../../TEMPORARY_BRIDGES.md)。每项包含当前职责、真实consumer、替代组件、退场phase及gate。不要复制第二份相互矛盾的删除时间表。

4.5B 已去除旧 Git/URL/模式/迁移兼容，但不能整删scripts、task.sh、otask.sh、preload、deps/dep_cache、scheduler、status/token内部结果通道。ENV generator 已在 full map transport Gate 通过后删除（B05）；B07 已独立，B03 不再作为 Discovery 输入。

新代码不得对桥内部命名、路径、HTTP路由添加依赖；在service边界注入adapter。后阶段通过gate后删除bridge与纯兼容测试，并更新此登记。无调用图边不证明Shell/DI/动态router没有consumer。

## Phase 5

B06 的 Hook 部分已移除；B11 缩为内部 Settings；新增 B17 source workspace 映射和配置执行租约。完整消费者与退出条件以 [登记表](../../TEMPORARY_BRIDGES.md) 为准。

Phase 6 已复核 B02/B06/B09/B10/B17 并保留。Runtime 自身 lease/supervisor helper 的原因、消费者与退出条件见根目录 [桥登记](../../TEMPORARY_BRIDGES.md#phase-6-复核)。

## Phase 7 bridge outcome

B09/B10 Python 仍被当前 Task prefix/preload/Dependency installer 使用，明确 RETAINED；新 Environment 不是自动默认 Task 环境。退出条件为 Phase 9/10 的显式绑定与执行替换 gate，Node/Linux 依赖待 Phase 8。没有新增 Task bridge。
