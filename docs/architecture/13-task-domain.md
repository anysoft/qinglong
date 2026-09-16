# Task Domain — Phase 11

> Phase15 convergence: schema v9 remains unchanged. The current cross-domain ownership, physical bridge removals and operations contract are in [Platform overview](00-platform-overview.md) and [Platform operations](20-platform-operations.md). Earlier bridge-retention statements below are historical. Hosted Linux qualification is a separate gate in [Phase15](../../PHASE15_REPORT.md).

Task 是定义的正式中心；TaskTriggers 为独立触发定义，TriggerEvents 保存接收事实，TaskRuns / TaskRunAttempts 承担执行。Task 不含 schedule 字段，SchedulerProjections 退出正常任务路径。Task 定义没有绝对运行路径或 Build pin；这些属于运行快照。

```mermaid
flowchart TD
  Repository --> Worktree
  Worktree --> Source[TaskSource]
  Source --> Task
  PythonEnvironment --> Binding[TaskRuntimeBinding]
  NodeEnvironment --> Binding
  Binding --> Task
  Task --> ENV[Global / Repository Profile / Task ENV]
  Task --> Config[Repository / Task Config Bindings]
  Task --> Hooks[Task Hooks]
  Task --> Settings[TaskExecutionSettings]
  Task --> Triggers[TaskTriggers]
  Triggers --> Events[TriggerEvents]
  Events --> Submit[ExecutionService.submit]
```

## 逻辑资源解析

```mermaid
flowchart LR
  Task --> Resolver[TaskResourceResolver]
  Resolver --> Source[Source → Worktree → Repository]
  Resolver --> Runtime[Task explicit → Subscription default → Repository default]
  Resolver --> ENV[Global → Profile → Task override]
  Resolver --> Config[Repository → Task ATTACH / MASK]
  Resolver --> Hooks[Task Hook metadata]
  Resolver --> Readiness[READY / CONFIGURATION_REQUIRED / INVALID / SOURCE_MISSING / RESOURCE_UNAVAILABLE]
```

## Phase 10 边界

```mermaid
flowchart TD
  Definition[Task + TaskResourceResolver] --> Future[ExecutionResolver]
  Future --> Context[Immutable ExecutionContext]
  Context --> Runner[Runner v2]
```

Phase 10 已实现 executable、ENV、Config revision、Hook snapshot 和 Worktree lease 的单次解析。当前 `TaskExecutionBridge → ExecutionService → Runner v2` 消费 managed Environment Build；正常执行不再调用 task.sh。详见 [Execution Engine](14-execution-engine.md)。

API/UI、迁移、readiness 和桥接说明见 [Phase 9 文档](../refactor/phase9/01-task-domain.md)。

当前 Trigger/Discovery 契约见 [Phase 11](15-discovery-triggers.md)。
