> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](docs/architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Phase 2 Status

> 历史阶段报告：Phase 3 已增加显式 Managed 订阅管线；当前增量与验证结果见 [PHASE3_REPORT.md](PHASE3_REPORT.md)。原阶段结论保留为历史快照。

**PASS** — persistent bare repository storage, native Worktrees, safe lifecycle operations and cross-process locks/leases implemented alongside the unchanged legacy execution pipeline.

Baseline: `53ac03c8` (develop). Changes are local and uncommitted. No live database upgrade or deployment was performed.

## Repository Storage

PASS — existing Repository identity extended; explicit initialization, persistent shared object store, fetch/prune of remote refs, current credential resolution, safe paths, diagnostics and protected deletion.

## Worktree

PASS — first-class DB resource; branch/tag/commit, shared objects, status, FF-only update, dirty/local-commit deletion protection, missing/stale recovery.

## Git Status

PASS — staged/modified/untracked/ignored/conflict, clean/dirty, HEAD, detached, ahead/behind/diverged, missing remote refs and changed files.

## Lock / Lease

PASS — POSIX cross-process repository locks and Worktree execution leases; busy owner diagnostics; timeout/error/crash cleanup. No Task binding is introduced.

## API

PASS — workspace services exposed through panel APIs, strict input validation and coded errors; open-token access rejected.

## UI

PASS — repository workspace entry, Overview / Refs / Worktrees / Activity, create/view/refresh/update/delete, dirty refusal, diagnostics/repair and busy details.

## Failure Recovery

PASS — retained intermediate DB states, safe prune/repair, filesystem-success/DB-failure retries, orphan/ownership checks and missing object-store protection.

## Legacy Regression

PASS — existing Subscription → legacy clone → scripts → Task remains unchanged.

## Tests

**245 passed / 0 failed / 3 skipped**: existing 176 + Phase 0 17 + Phase 1 33 + Phase 2 19. Backend build PASS; frontend production build PASS; browser validation PASS. Standalone frontend type checking retains 65 pre-existing diagnostics, identical to Phase 1 with skipLibCheck.

See [test report and reproduction](docs/refactor/phase2/08-phase2-test-report.md).

## Production Behavior Changed

**NO for existing execution behavior.** New workspace operations and an additive schema migration are delivered; they run only through the new resource lifecycle. Repository metadata creation remains offline.

| Existing behavior gate | Changed? |
| --- | --- |
| Subscription clone behavior | NO |
| scripts copy | NO |
| Task command | NO |
| Task cwd | NO |
| Task runtime | NO |
| ENV injection | NO |
| Dependency behavior | NO |

## Database Changes

Add storage/fetch/refs metadata to Repositories; create Worktrees with RESTRICT FK, unique managed branch key and repository index. Atomic idempotent phase2-workspace migration; ledger total 19. No Task/ENV/runtime schema changes. [Model and relation ADR](docs/refactor/phase2/02-worktree-model.md).

## Filesystem Changes

New `$QL_DATA_DIR/git/<host>/repository-ID.git`, `worktrees/repository-ID/wt-ID`, `.locks/`. Identity comes from DB IDs, never branch text. Existing repo/ and scripts/ remain in use. Worktree .git is a pointer file into shared bare administration. [Layout and backup classification](docs/refactor/phase2/06-filesystem-layout.md).

## API Changes

Under existing panel `/api`:

- Repository POST `/:id/initialize`, `/fetch`, `/prune`, `/repair`, `/remote`; GET `/:id/status`, `/refs`, `/worktrees`; protected DELETE `/:id`.
- Worktrees GET collection/detail, POST create, PUT display-name update, DELETE; POST `/:id/update`, `/refresh`, `/repair`, `/remove-record`.
- No caller-selected filesystem paths or force-reset options. Controllers delegate to services; they never invoke Git or delete files directly.

## UI Changes

Repository list links to `/repository-workspace?id=ID` (under the configured base URL). A single-level route works with the project's relative production asset URLs. The detail page adds storage metadata, refs, managed Worktrees and page-session activity. Existing Script Editor and Task pages are unchanged. Failed mutations refresh cached state while retaining the targeted error message.

## Lock Design

Stable POSIX flock files, repository-before-Worktree ordering, nonblocking BUSY errors, no expiry stealing. Python stdlib supervisor owns descriptors through Git termination; controller disconnect kills the Git process group. Different repositories are independent. [Lock protocol](docs/refactor/phase2/04-lock-and-lease.md).

## Lease Design

An execution lease holds a Worktree lock after validation under a repository lock. It blocks update/delete/prune and reports owner/PID/start time. Different Worktrees may hold leases concurrently. Future executors must bind their process lifetime to this supervisor contract; existing Tasks do not obtain leases.

## Git Command Changes

Only new workspace services use GitCommandService plus the supervised argv runner. Initialization is init --bare + clean origin + fetch. Fetch updates remote-tracking refs/tags; Worktree update uses merge --ff-only. Local branches are generated ql-worktree-ID so fetch cannot move an occupied branch. Local operations time out after 30 seconds, network commands after 5 minutes; output is bounded. No legacy Git command builder changed.

## Security

Reuse Phase 1 credential resolution, sanitized environment and secret redaction. Workspace DB/Git config receive no credentialized URLs. ID paths, realpath/lstat boundary checks, owned bare markers, reciprocal Worktree pointers and actual Git top-level validation reject traversal, symlinks, unknown directories and redirected checkouts. Hooks are disabled for these managed Git commands. Dirty/ignored files and local history block destructive lifecycle actions. No force API.

## Legacy Compatibility

Repository metadata remains usable by Phase 1 Subscription compatibility without initializing storage. Equivalent remote spelling changes are blocked while old subscriptions reference the repository, protecting their naming behavior. Credentials may change without reclone. Backup/Task/ENV/dependency behavior is not modified.

## Known Limitations

- Advisory locks cover cooperating services on one local POSIX host; external manual Git and multi-host/NFS are outside the tested guarantee.
- Python 3 is required for the new lock helper. Windows is not supported by this POSIX implementation.
- Missing uncommitted content cannot be recovered; missing shared objects with recorded Worktrees require restoration, not automatic reclone.
- Existing backup code has not been extended. Dirty files and local commits need explicit backup of worktrees, shared Git objects and DB metadata.
- Disk-size UI and fetch cancellation API are deferred. Activity is page-local plus existing server logs, not a new audit database.
- Existing frontend type-check debt and Phase 1 secret-storage/crash-temp-file limitations remain.

## Important Findings

1. Clean checkout does not mean safe to delete: ahead/diverged and detached local commits must be protected.
2. Worktrees share objects and contain .git files, so backing up only their directories loses local Git history.
3. Database and filesystem mutations need retained states and retries; they cannot be made one SQLite transaction.
4. A Node process lock alone is insufficient when Git children outlive it; the supervisor keeps OS locks through child termination.
5. New and legacy Git paths now coexist; Task still uses only the legacy path.

## Phase 3 Preconditions

Start with RepositoryStorageService.initialize/fetch and WorktreeService.ensure/update/status; do not bypass services to run Git. Explicitly design Subscription migration and Task discovery in Phase 3. Before any future Task → Worktree execution binding, tie process lifetime to execution leases, define working-directory/runtime contracts and implement unique workspace-data backup. None of these Phase 3 behaviors is enabled here.

## Documentation

[Repository storage](docs/refactor/phase2/01-repository-storage.md) · [Worktree model](docs/refactor/phase2/02-worktree-model.md) · [Lifecycle](docs/refactor/phase2/03-worktree-lifecycle.md) · [Locks/leases](docs/refactor/phase2/04-lock-and-lease.md) · [Git status](docs/refactor/phase2/05-git-status-model.md) · [Filesystem/backup](docs/refactor/phase2/06-filesystem-layout.md) · [Recovery](docs/refactor/phase2/07-failure-recovery.md) · [Tests](docs/refactor/phase2/08-phase2-test-report.md).
