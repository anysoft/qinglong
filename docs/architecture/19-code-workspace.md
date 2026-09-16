# Code Workspace — Phase12, schema v9

> Phase15 convergence: schema v9 remains unchanged. The current cross-domain ownership, physical bridge removals and operations contract are in [Platform overview](00-platform-overview.md) and [Platform operations](20-platform-operations.md). Earlier bridge-retention statements below are historical. Hosted Linux qualification is a separate gate in [Phase15](../../PHASE15_REPORT.md).

Workspace 是注册 Worktree 的文件/Git 操作视图，不持有另一份源码。生产入口、限制和验证见 [Phase12](../refactor/phase12/01-workspace-domain.md)。

```mermaid
flowchart LR
 Repository --> Bare[Git object store]
 Bare --> Worktree
 Worktree --> Sync[Git Sync]
 Worktree --> Discovery
 Worktree --> Source[TaskSource]
 Worktree --> Execution
 Worktree --> Backup[Backup / Restore]
 Worktree --> Editor[Code Workspace]
```

```mermaid
flowchart TD
 Editor[Editor mutation] --> Shared[Platform mutation shared FD]
 Execution --> Shared
 Sync[Managed Git Sync] --> Shared
 Shared --> EX[Canonical Worktree EX lease]
 EX --> Files[File or Git operation]
 Quiesce[Backup QUIESCING] --> Drain[Wait for shared FD release]
 Drain --> Snapshot[Platform exclusive snapshot]
```

```mermaid
flowchart LR
 Read[Read hash H1] --> Draft[In-memory editor draft]
 Draft --> Save[Save expected_hash H1]
 Save --> Lease[Platform shared + Worktree EX]
 Lease --> Compare{Current hash matches?}
 Compare -->|No| Conflict[409 Conflict: Reload / Cancel]
 Compare -->|Yes| Temp[Private same-dir temp / write / preserve mode / fsync]
 Temp --> Recheck[Recheck original]
 Recheck --> Rename[Atomic rename + fsync directory]
```

```mermaid
flowchart LR
 File[Working files] --> Diff[Working diff]
 File --> Stage[Explicit Stage]
 Stage --> Index[Index / staged diff]
 Index --> Commit[Explicit Commit + configured author]
 Commit --> Local[Local HEAD]
 Local --> Push[Explicit credentialed Push]
 Push --> Origin[Verified origin branch]
 Sync[Official ManagedSubscription sync] --> Discovery[Discovery reconcile]
 Discovery --> GitEvent[GitUpdate event]
 GitEvent --> Run[ExecutionService.submit]
```

文件 Save/Commit/Push 没有通向 GitUpdate 或 Run 的边。源码读取第一版也拿排他租约：执行时返回BUSY；残留材料化journal返回RECOVERY_REQUIRED，不显示临时Secret。B01 Editor退出，B14日志与Phase14完整备份继续承担各自职责。
