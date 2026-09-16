# Native semantics qualification

Local evidence is Darwin evidence. The new Ubuntu workflow must execute the
same repository tests; no syscall is mocked and Darwin does not certify Linux.

| Surface | Direct evidence |
|---|---|
| Open-file-description flock | `native-semantics.test.cjs`: Node owns FD, Python helper acquires, Node child passes to grandchild, parent exits, competing acquisition remains busy, final owner closes, acquisition succeeds |
| FD across exec | `fd-exec.test.cjs`: production HookExecutor passes explicit lease FD through Node/Python/Shell; unrelated private inode and supervisor result descriptor are absent |
| Atomic no-replace | `native-semantics.test.cjs`: fixed production helper, literal unusual names, Unicode/leading dash, two independent writers/exactly one winner, symlink and directory destinations preserved |
| Publication durability | Phase12/files: atomic write and rollback after write failure and parent fsync failure; original bytes and mode preserved |
| Process groups/recovery | Phase10 recovery/hardening and Phase14 restore tests retain real subprocess/SIGKILL behavior |
| Unix submission socket | `socket-recovery.test.cjs`: 0700 parent, 0600 socket, malformed request, 20 concurrent Task submissions, SIGKILL owner, stale socket restart, cleanup |

## Socket convergence

The new concurrency test repeatedly timed out at the existing five-second
protocol deadline before the fix. The server launched parallel SQLite
`BEGIN IMMEDIATE` writers from every socket callback. Such writers can occupy
the native worker pool while the lock holder still needs it to finish.

The socket server now serializes accepted submissions, with a 128-entry bound
and explicit BUSY response. It acknowledges only after durable submission. A
disconnected request that has not started is discarded; an already-started
write retains its domain transaction semantics. Deadline was not increased.
Ten repeated runs each exercised 20 concurrent submissions plus owner crash
and restart, all passing locally. This is also included in Linux qualification.

## Lease ownership

Repository/Worktree, Runtime/Environment Build, platform backup mutation,
TaskRun owner and notification dispatcher use FD leases. They are distinct
ownership domains; one helper's passing flock test does not replace their
domain integration tests. Runtime, Workspace, Backup and Notification recovery
suites remain required. PID/start-identity checks are used only for owned
process cleanup, never as the sole lock-ownership proof.
