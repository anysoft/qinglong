# Failure recovery

SQLite, Git administration and filesystem changes are not one transaction. Services retain intermediate states and identities for explicit recovery; they never infer that an absent directory authorizes deleting local history.

| Observation | Safe response |
| --- | --- |
| Metadata only | Initialize explicitly; no network during metadata creation |
| First fetch failed after valid bare creation | Fix access, run Fetch; initialization adopts owned storage without reclone |
| Partial unknown/corrupt directory | ERROR/PATH_CONFLICT; inspect or restore manually, no destructive automatic replacement |
| Bare directory missing, no Worktrees | Diagnostics → MISSING; Initialize can recreate |
| Bare missing, Worktrees recorded | Restore object store; automatic fresh init refused to protect unique history |
| Origin mismatch | Repair Metadata validates ownership and restores DB clean URL/refspec |
| Worktree directory missing, Git registration remains | Prune under locks, then Repair or Remove Record |
| Worktree missing after Git delete but DB delete failed | Repair reconstructs from recorded commit/retained branch, or safely remove missing record |
| Dirty/conflict/ignored content | Stop; user saves/resolves content outside lifecycle operation |
| Ahead/diverged/local detached commit | Preserve; never reset to make deletion succeed |
| Repository files deleted but DB destroy failed | Row retained; diagnostics marks MISSING; retry delete |
| Orphan Git Worktree, no DB row | Diagnostics lists it; repository deletion refuses; no automatic rm |
| Process crash | OS lock releases after supervised Git termination; diagnose retained lifecycle state |
| Timeout/output limit | Terminate Git; retain coded error; release lock; diagnose then retry |

Missing uncommitted files cannot be reconstructed by Git. Repair does not recover data already removed externally. Unknown ownership, symlink replacement, mismatched .git pointers and redirected core.worktree all stop automatic actions.

Errors use static codes/messages; network stdout/stderr are redacted through Phase 1 before leaving the command layer. API never returns raw exception text for unknown failures. Network temporary credential cleanup uses the Phase 1 resolver; abrupt process termination retains Phase 1's temporary-file limitations. Workspace DB/config never stores credentialized URLs.

System logger records workspace operation, repository ID and result code. Activity UI is a page-session summary, not a new persistent audit database.
