# Current database contract

Operational schema version is **9**. Phase15 makes no schema upgrade or default
change. `initializeOperationalSchema` creates a fresh known schema transactionally,
checks its identity on restart, and fails closed on unknown/partial/unexpected
objects. It does not import or migrate a legacy QingLong database.

Tasks, TaskTriggers/TriggerEvents, Runtime/Environment revisions and Builds,
TaskRuns/Attempts, notification outbox/delivery, Config assets and Git resources
remain the domain facts. Transactions and foreign keys preserve cross-resource
references. A disabled Cron retains its NOT NULL `next_fire_at` as dormant data;
selection also requires the associated enabled TaskTrigger.

Older SchedulerProjections, RunningInstances, TaskStats, TaskViews and Dependences
are retained in the frozen v9 storage shape to avoid destructive rewriting. No
controller, scheduler, startup reset, retention service or dependency installer
uses them as live domain state. Their storage definitions are not a compatibility
API. Existing historical rows and directories are not silently deleted.

Backup/Restore validates the same schema and consistent SQLite snapshot. It must
preserve the database and unique Git/Worktree/Config material together. Disposable
Runtime build material is restored according to its formal rebuild contract.
