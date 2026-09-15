> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Locks and execution leases

## Authority

`WorkspaceLocks` starts an isolated Python 3 stdlib helper (`python3 -I -S shell/git_workspace_lock.py`). Linux/macOS POSIX `flock(LOCK_EX|LOCK_NB)` on stable files under `.locks/` is the authority. No Node-only mutex, database Boolean, expiry timestamp, unlink-and-recreate lock, or stale PID stealing is used. This requires Python 3 and POSIX flock, already available in the supported project runtime; Task executable selection is unchanged.

Lock order is repository first, followed by ascending Worktree IDs. Repository locks serialize initialize, fetch, create, update, delete, repair, prune and diagnostic Git reads. Busy requests return immediately. Different repositories do not block one another. Updates of different Worktrees conservatively share the repository mutation lock.

Execution lease acquisition validates under the repository lock and acquires a separately held Worktree lock, then releases the repository lock. Different Worktrees can hold execution leases concurrently. A lease blocks mutation/deletion of its Worktree and repository prune; fetch may proceed because it does not alter checkout content. No current Task obtains a lease.

Metadata: owner_type, owner_id, operation, helper PID, controller PID and start time. Metadata is informative and may remain after release; only an OS lock probe decides BUSY. `guard.release()` is required in finally.

## Child lifetime and failure

The helper runs argv-based Git without a command shell, drains output and owns the lock until the Git child is reaped. Git inherits lock file descriptors. Controller EOF/crash or cancellation terminates the child process group before the helper exits. OS descriptors release on process exit and container shutdown. A hung Git command has a deadline: local 30 seconds, network 5 minutes; combined output is capped at 4 MiB. Timeouts map to GIT_TIMEOUT and mutation ERROR state.

Cross-process tests cover busy exclusion, owner SIGKILL, crash during an active Git child, actual Git timeout, exception cleanup and independent repositories/leases.

## Boundaries

Advisory locks cannot constrain a user manually running Git outside these services. This version targets one host and a local POSIX filesystem; NFS/multi-host semantics are not certified. The future Task integration must tie executor process lifetime to the lease supervisor, not merely hold a handle in Node and release it while an independently launched task remains alive. No lease-to-Task binding is delivered in Phase 2.
