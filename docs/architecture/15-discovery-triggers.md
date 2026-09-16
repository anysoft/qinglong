# Discovery v2 + Trigger Model — Phase 11

当前 schema v8。Task、Trigger、TriggerEvent、TaskRun 分离；执行核心继续采用 Phase 10 immutable Context 与 Runner v2。

## Trigger / Task / TaskRun

```mermaid
flowchart LR
  Task --> Bindings[Source / Runtime / ENV / Config / Hooks / Settings]
  Task --> Triggers[0..N TaskTriggers]
  Triggers --> Cron[CronTrigger]
  Triggers --> Webhook[WebhookTrigger]
  Triggers --> Git[GitUpdateTrigger]
  Cron --> Events[(TriggerEvents)]
  Webhook --> Events
  Git --> Events
  Events --> Submit[ExecutionService.submit]
  Manual[Manual / API] --> Submit
  Submit --> Runs[(TaskRuns / Attempts)]
  Runs --> Resolver[ExecutionResolver]
  Resolver --> Context[Immutable ExecutionContext]
  Context --> Runner[Runner v2]
```

## Discovery flow

```mermaid
flowchart TD
  Policy[DiscoveryPolicy: globs / languages / enabled] --> Scan[Worktree regular files]
  Scan --> Plan[Stable identity + deterministic plan]
  Existing[Task + owned Cron definitions] --> Plan
  Plan --> Preview[Read-only preview]
  Plan --> Tx[IMMEDIATE reconcile transaction]
  Tx --> Tasks[Create / update / retire Tasks]
  Tx --> Cron[Create / update / remove DISCOVERY Cron]
  User[Runtime / ENV / Config / Hooks / Settings / USER triggers] --> Preserve[Preserve user ownership]
  Preserve --> Tx
```

## Git update flow

```mermaid
flowchart TD
  Lock[Subscription + Repository + Worktree leases] --> Fetch[Repository fetch]
  Fetch --> Update[Fast-forward Worktree]
  Update --> Discovery[Discovery reconcile]
  Discovery --> Diff[Fixed argv Git diff / filter]
  Diff --> Event[Unique Git event identity]
  Event --> Submit[ExecutionService.submit]
  Discovery -->|failure| Retry[Keep Git update; retry same commit]
```

## Scheduler transition

```mermaid
flowchart LR
  Legacy[Historical Task schedule / SchedulerProjection] -. frozen migration .-> Cron[(CronTriggers)]
  Clock[One shared Clock loop] --> Due[Index: next_fire_at + trigger_id]
  Cron --> Due
  Due --> Tx[Atomic event + cursor advance]
  Tx --> Inbox[(TriggerEvents)]
  Inbox --> Submit[ExecutionService.submit]
  Old[crontab.list / Task node-schedule / private launcher] -. outside normal Task path .-> Gate[Physical Linux cleanup gate]
  Sync[Subscription / system maintenance] --> Transport[Retained ScheduleService]
```

没有新执行器、消息队列、Task ENV 路径或源码 staging 层。详细契约与证据见 [Phase 11](../refactor/phase11/01-trigger-domain.md) 和 [报告](../../PHASE11_REPORT.md)。
