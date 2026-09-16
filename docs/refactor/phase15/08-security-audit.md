# Security audit and qualification boundaries

## Preserved boundaries

- Existing panel/Open API authorization, Webhook verification/body limits, private
  Runtime/Backup/Workspace routes and secret masking remain in their production suites.
- Git operations retain credential-free remote identity, fixed argv and restricted
  hooks/fsmonitor/external diff/textconv behavior. Worktree path validation, no-follow
  reads, no-overwrite publication and private helper lifetime remain required.
- Runtime/Build execution uses explicit absolute executables, selected package
  layouts, literal argv and frozen ENV. Retired shell interpolation/global paths
  no longer provide Task execution or package management.
- Native private directories, explicit inherited FDs, process groups and owner
  checks remain. The new FD test verifies unrelated/result descriptors do not leak.
- Fresh bootstrap no longer creates a privileged built-in system App or token
  refresh process. Existing user App records and scoped public API authentication
  are preserved. Cron/status/dashboard RPC/HTTP and arbitrary command-run/stop
  consumers are physically absent.
- mTLS remains mandatory on the backend RPC server. Implicit SDKs with insecure
  credential fallback are removed with the preload source.

## Data protection

Retention has moved from legacy status/global-cache deletion to generated
Subscription log paths. Preview does not write; cleanup excludes active syncs,
TaskRun logs, user filenames and symlinks. Existing user data is not removed by
bootstrap. v9 historical tables remain storage objects with no live domain consumer.

CI evidence uses the existing bounded collector, redactor, canaries and owner-based
cleanup. Private runtime fixture paths, secrets, SQLite files and raw state tokens
must not be committed. The final local artifact audit records scrub/cleanup results.
No dependency upgrades or project package additions are part of this change.

## Limits

This is code-path review plus targeted/regression evidence, not a claim that every
possible vulnerability is ruled out. Darwin cannot verify Linux kernel behavior.
New Ubuntu qualification, including secret scan, cleanup and artifacts, is mandatory.
Docker deployment templates and release distribution are not qualified in Phase15.
