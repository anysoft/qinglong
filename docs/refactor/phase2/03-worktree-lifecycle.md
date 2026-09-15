> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Worktree lifecycle

## Create

Require READY storage, validate ref with a safe ref namespace and Git, resolve commit, reserve a CREATING DB row, compute ID-based path, then native `git worktree add`. Branch mode uses a generated local branch and origin upstream; commit/tag mode uses `--detach`. Verify registration, reciprocal .git pointers and actual Git top-level directory, then mark READY. Failures preserve a diagnosable ERROR row rather than discarding evidence.

## Update

Acquire repository and Worktree locks; read fresh status. Missing/stale, conflicting, dirty (including staged, untracked and ignored files), detached or missing remote refs are refused. Diverged history is refused. Ahead-only history is preserved unchanged. Otherwise run `git merge --ff-only --no-edit refs/remotes/origin/<branch>` and refresh the snapshot. Fetch is an explicit separate operation.

No production path calls reset --hard, clean -fd, forced checkout or forced worktree removal. There is no force API.

## Delete

Fresh status must be clean and contain no unmerged local commits. Branch mismatch or missing remote refs block deletion. Detached HEAD must still equal the original target commit. Mark DELETING, use native `git worktree remove`, safely delete the generated branch with `branch -d`, then delete the DB row. Unknown directories are never recursively removed as Worktrees.

## Repair and record removal

Missing directory plus stale Git registration: Prune first. Prune locks all known Worktrees and is refused while an execution lease exists. Repair reconstructs a missing registered DB resource from its retained branch/commit; it does not reset existing content. Existing dirty Worktrees refuse Repair. Remove Record requires missing disk and no Git registration, and still protects local commits. See the recovery matrix.

Rename changes display metadata only. `ensure`, `update`, `status`, `acquireExecutionLease` and guard `release` provide future internal integration points; no Task uses them yet.
