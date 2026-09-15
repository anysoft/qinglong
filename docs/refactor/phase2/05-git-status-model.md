# Git status model

The backend reads `git status --porcelain=v1 -z --untracked-files=all --ignored=matching`, parses both index/worktree columns and rename records, and returns a unified snapshot:

- head, branch, remoteBranch, detached;
- staged, modified, untracked, conflicted, ignored, changed_files;
- clean, ahead, behind, remote_missing.

Ahead/behind come from `git rev-list --left-right --count HEAD...<remote ref>`. They are null when no comparable branch exists. A clean file tree can still contain unique local commits. Ahead-only update is a no-op; diverged update and local-commit deletion are refused.

Lifecycle (CREATING/READY/ERROR/MISSING/STALE/DELETING), dirty status (UNKNOWN/CLEAN/DIRTY/CONFLICT), and live lease occupancy are separate. DIRTY and BUSY can coexist. During a held execution lease, detail returns the cached snapshot and live owner metadata instead of running Git against a changing checkout. Lists return cached data and local lease probes, with no remote requests.

The UI displays branch/ref, HEAD, lifecycle, dirty, ahead/behind, busy, path and last update; details include changed files and active lease. Known coded errors provide targeted messages. Detached HEAD is shown as Detached, not treated as a missing branch.
