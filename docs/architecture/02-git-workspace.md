# Git resources and Workspaces

Repository owns normalized remote identity, credential reference and managed Git
object storage. Worktree owns a canonical checkout, ref and local state. Subscription,
Task execution and Code Workspace consume these resources directly; there is no
staged `data/scripts` copy and no ScriptService editor.

Repository fetch and Worktree update retain leases, dirty/untracked protection,
credential isolation and successful-watermark rules. Workspace operations share
exclusive Worktree coordination with execution/config materialization and sync.
Git commands use validated fixed argv and suppress untrusted hooks and external
helpers where required. Credential material is private and is not stored in remote URLs.

Code Workspace provides bounded tree/read/edit/rename/delete and Git status/diff/
commit operations through the actual Worktree. Path boundaries, no-follow reads,
no-overwrite rename, atomic write/rollback and user-data preservation are formal
contracts; see [Code Workspace](19-code-workspace.md).

Discovery and Git triggers follow successful sync/commit events through their
services. A dirty tree or failed fetch cannot advance the last successful sync
watermark. Backup captures unique local content and Git state under the same
platform mutation barrier; unpushed or untracked work is not disposable cache.
