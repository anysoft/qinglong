# Current service boundaries

- HTTP controllers validate and authorize; services own transactions and resource policies.
- ExecutionService owns durable TaskRun admission. ExecutionResolver freezes resources;
  ExecutionAttemptCoordinator/Runner v2 owns actual process lifecycle and result delivery.
- TriggerScheduler selects enabled Cron triggers before applying its due-row limit.
  Disabled deadlines are dormant; re-enabling calculates a future occurrence inside the write transaction.
- ScheduleService is the internal Subscription recurrence/process adapter. Task scheduling does
  not use it. Its bounded queue retains capacity until pipes drain and cleanup completes.
- The protected Unix submission socket serializes durable SQLite admission and bounds pending
  requests. It does not expose arbitrary command execution or accept a client-supplied result.
- mTLS gRPC provides the explicit Global ENV/system notification API and health transport.
  Cron RPC messages and handlers are physically absent. No startup/preload SDK is injected.
- System settings owns typed metadata, timezone/language and subscription log retention.
  It does not source shell config, install global packages, overwrite application code or dispatch Tasks.
- Platform process supervision belongs to the operator; foreground startup has fixed argv.
- ConfigMaterialization and Worktree/Build leases remain held for the lifetime required by Hooks,
  Runner descendants and recovery. Source cleanup cannot remove these responsibilities.
- Notification terminal events commit to Outbox with the TaskRun result. Provider failure cannot
  change the result. Explicit system/login notifications are a separate backend service contract.
- Backup mutations use the same barrier as workspace, execution and runtime operations. Offline
  restore resumes before the normal platform opens its database.
