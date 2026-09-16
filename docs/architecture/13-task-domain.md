# Task Domain — Phase 9

Task 是定义的正式中心；SchedulerProjections 仅为调度输出，TaskRuns / TaskRunAttempts 承担执行。Task 定义没有绝对运行路径或 Build pin；这些属于运行快照。

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
  Task --> Schedule[SchedulerBridgeService]
  Schedule --> Projection[SchedulerProjections]
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
