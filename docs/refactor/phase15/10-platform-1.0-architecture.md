# Platform 1.0 architecture convergence

Current architecture is documented in `docs/architecture/00-platform-overview.md`
and documents 01, 05, 07, 08, 20. They describe actual source ownership rather than
concatenated historical phase targets. Detailed Runtime/ENV/Task/Execution/
Discovery/Observability/Backup/Workspace contracts remain in documents 09–19.

The normal path is Repository → Worktree → Task resource bindings → TriggerEvent
→ immutable ExecutionContext → Runner v2 → TaskRun/Attempt → Log/Outbox/Delivery.
Subscription recurrence remains a formal internal operation; system crontab
projection and Shell→Open API result transport are absent.

Schema v9 is unchanged. Historical table storage and existing user directories
remain intact. Fresh bootstrap does not create legacy execution/package layouts.
Typed Settings and private bootstrap replace sourced shell config. Foreground
startup and operator supervision replace ql code-update/launcher glue.

A formal internal component has real responsibilities and tests. It is not a
renamed temporary launcher: TaskExecutionFacade reads/submits/cancels TaskRuns;
Config materialization keeps journal/restore/FD lease behavior; internal Schedule
only serves Subscription recurrence. The 17-item matrix records every disposition.
