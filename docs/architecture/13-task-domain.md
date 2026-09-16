# Task Domain — Phase 9

Task 是定义的正式中心；SchedulerProjections、RunningInstances 与日志仍是临时执行桥。Task 定义没有绝对运行路径或 Build pin。

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
  Definition[Task + TaskResourceResolver] --> Future[Phase 10 Execution Resolver — 尚未实现]
  Future --> Context[ExecutionContext — 尚未实现]
  Context --> Runner[Runner v2 — 尚未实现]
```

Phase 9 不组合 executable、完整 ENV、Config revision、Hook snapshot 和 workspace lease。当前 `TaskExecutionBridge → CurrentTaskBridgeService → task.sh` 沿用现有执行方式；Python/Node Environment 绑定没有被当前进程消费。

API/UI、迁移、readiness 和桥接说明见 [Phase 9 文档](../refactor/phase9/01-task-domain.md)。
