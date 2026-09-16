# Current domain ownership — schema v9

| Resource | Owns | Does not own |
|---|---|---|
| Credential | Secret storage and Git authentication policy | Repository identity or branch |
| Repository | Normalized remote identity and managed Git objects | A particular checkout |
| Worktree | Canonical checkout, ref and local modifications | Task execution result |
| Subscription | Fetch/sync policy, selected Worktree and successful sync watermark | Task command projection |
| Discovery | Stable discovered identity and reconciliation | User-owned Task overrides |
| Task | Schedulable definition, source and resource bindings | Cron clock or current PID |
| Trigger / TriggerEvent | Scheduling/input and durable admission | Execution implementation |
| Runtime | Managed interpreter/toolchain installation | Task packages |
| Dependency Environment | Desired revisions and immutable resolved Builds | Global package installation |
| Scoped ENV | Global, Repository profile and Task values, UNSET and secrets | Language preload files |
| Config Asset / Hook | Immutable content versions, bindings and lifecycle policy | Arbitrary platform settings |
| ExecutionContext | Validated, frozen inputs and pinned resource identities | Mutable settings lookup during retry |
| TaskRun / Attempt | Durable queue, owner, retry, cancellation and terminal result | SchedulerProjection or filename identity |
| Notification | Channel/Policy, terminal outbox and delivery attempts | Changing an execution result on delivery failure |
| Backup / Restore | Consistent snapshots, portable material, offline recovery | Automatic legacy migration |

Schema v9 is unchanged. Earlier SchedulerProjections, RunningInstances, TaskStats, TaskViews and
Dependences objects remain part of the frozen storage format. They are not live scheduling,
execution, dependency management or startup-recovery facts. Removing their persisted data is not
authorized by source consolidation. Existing user Apps and credentials remain intact; a fresh
installation no longer creates a privileged built-in system App.
