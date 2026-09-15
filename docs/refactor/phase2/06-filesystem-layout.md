> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Filesystem layout and backup classification

```text
$QL_DATA_DIR/
├── git/                         NEW: QingLong-owned object stores
│   └── github.com/
│       └── repository-42.git/
│           ├── objects/
│           ├── refs/remotes/origin/
│           └── worktrees/wt-17/  Git administration
├── worktrees/                   NEW: persistent user workspaces
│   └── repository-42/
│       ├── wt-17/               display: main
│       │   └── .git             FILE pointing to bare worktrees metadata
│       └── wt-18/               display: feature/totp_login
├── .locks/                      NEW: stable POSIX lock files
│   ├── repository-42.lock
│   └── worktree-17.lock
├── repo/                        LEGACY subscription checkout
├── scripts/                     LEGACY copied task scripts
└── ...                          existing data unchanged
```

`RepositoryPathResolver` owns repository and Worktree path generation. Numeric DB IDs are identity; host is a validated display grouping. Remote path, alias and branch strings never enter directory segments. This avoids Unicode/case/Windows-invalid filename collisions without losing display names in the UI. The data root is canonicalized; every managed path component is checked with lstat and symlink escapes rejected. Managed roots use restrictive permissions.

Before Git mutations, Worktree .git must be a regular pointer file into the owned bare metadata, its reciprocal gitdir must match, and Git's actual top-level directory must equal the computed checkout. Bare ownership marker, clean origin, config includes, alternates and symlinks are checked. Recursive deletion is limited to a verified bare store with no Worktrees; Worktree deletion uses native Git.

## Backup architecture update

Repository storage is normally a rebuildable source mirror; clean, remotely reachable Worktrees can be recreated from identity/ref/commit metadata. However local branches, detached commits or unreachable objects may be the only copy of user history. A bare store containing these is **not disposable cache**.

Dirty/untracked/ignored Worktree files and local commits are unique user data. A future backup must preserve both checkout data and the objects/refs needed for local history, with a consistent SQLite snapshot. Copying a Worktree directory alone does not include its shared object database because .git is a file. Existing Backup implementation is unchanged; Phase 2 does not claim current backups preserve the new workspace data. Operational backups must explicitly include git/, worktrees/ and their DB metadata until a dedicated policy exists. Lock metadata is disposable and never a restorable claim of ownership.
