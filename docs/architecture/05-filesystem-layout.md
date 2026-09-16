# Current filesystem ownership

`QL_DATA_DIR` is an explicit absolute data root. It need not end in `/data`.
Fresh bootstrap creates private directories and rejects symlinked managed roots.

| Location under data root | Owner |
|---|---|
| `db/` | SQLite/schema v9 |
| `config/` | Platform credentials and mTLS material; no executable config.sh |
| `git/`, `worktrees/` | Repository and Worktree services |
| `runtime/` | Managed Python/Node/toolchains and immutable environment Builds |
| `cache/` | Rebuildable runtime/package artifacts |
| `config-assets/` | Immutable Config Asset revisions |
| `log/task-runs/` | RunLogService, Run ID identity |
| `log/subscription-ID/` | Subscription logs and explicit retention policy |
| `log/runtime/` | Runtime operations |
| `syslog/` | Winston platform logs and rotation |
| `.locks/`, `tmp/` | Stable lock inodes and owner-marked temporary resources |
| `upload/` | Validated upload operations |

BackupPaths owns its configured backup root, staging, exports and restore journal; it is not a
copy of the retired `bak/` contract. See [Backup/Restore](18-backup-restore.md).

Fresh bootstrap does not create `scripts/`, `deps/`, `dep_cache/`, `bak/`, `repo/` or `raw/`.
Existing directories and their contents are preserved. An operator must classify and back up
such data before any separate deletion request. Runtime/Build cleanup verifies ownership and
leases; it must not reinterpret unknown content as disposable cache.

Config materialization, execution private transport and rollback journals remain formal safety
components. Lock files keep stable inodes. A process exit alone does not prove that inherited FD
leases have been released by descendants. Sensitive directories/files follow their resource
contracts (0700 directories, 0600 or 0400 files).
