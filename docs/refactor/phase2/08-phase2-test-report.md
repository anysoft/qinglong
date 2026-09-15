# Phase 2 test report

Baseline: `53ac03c8` on develop. Validation date: 2026-09-15. Tests use Node 22.23.2, local Git fixture repositories, temporary SQLite databases/directories, Python 3 POSIX locks and Google Chrome. No live database, external repository or deployed service was mutated.

## Results

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Existing project | 176 | 0 | 3 |
| Phase 0 characterization | 17 | 0 | 0 |
| Phase 1 | 33 | 0 | 0 |
| Phase 2 | 19 | 0 | 0 |
| **Total** | **245** | **0** | **3** |

Backend and frontend production builds pass. Standalone frontend `tsc --noEmit --skipLibCheck` still reports exactly the same 65 diagnostics as Phase 1 (normalized file/line/code/message comparison); no workspace diagnostic was added. Without skipLibCheck, the existing dependency declarations add 121 diagnostics. Standalone frontend tsc is therefore not a clean gate, and is not reported as passing.

## Reproduce

From the project root, with dependencies installed:

```sh
npx --yes --package=node@22 -c 'node diagnostics/phase0/run-tests.cjs existing'
npx --yes --package=node@22 -c 'node diagnostics/phase0/run-tests.cjs baseline'
npx --yes --package=node@22 -c 'node --test tests/phase1/*.test.cjs tests/phase2/*.test.cjs'
npx --yes --package=node@22 -c 'npm run build:back'
npx --yes --package=node@22 -c 'npm run build:front'
```

Browser harness: `diagnostics/phase2/ui-smoke.cjs`; set PLAYWRIGHT_MODULE to an installed Playwright module when it is not locally resolvable, then run with Node 22 after building. It starts a loopback-only server with the production bundle, real workspace APIs/services, local Git fixture and temporary SQLite; only unrelated panel health/user endpoints are stubbed. Uses installed Chrome (`channel: chrome`).

## Coverage map

| File | Evidence |
| --- | --- |
| tests/phase2/domain.test.cjs | ID paths, traversal/symlink/collision protection, legacy upgrade and idempotency, actual Phase 1 resources preserved, injected Phase 2 DDL rollback/retry |
| tests/phase2/workspace.test.cjs | Persistent bare init/duplicate, refs/tags fetch/prune, current credentials, clean remote, shared objects, branch duplicates, status, FF-only, dirty/staged/untracked/conflict, ahead/diverged, detached/tag, missing/prune/repair, unsafe directories |
| tests/phase2/locks.test.cjs | Separate-process exclusion, success/error/crash release, actual timeout, crash during active Git, repo mutation matrix, concurrent fetch/update, independent repos and execution leases |
| tests/phase2/recovery.test.cjs | Filesystem/DB partial delete recovery, timeout ERROR, ignored files, symlink replacement, orphan diagnostics, equivalent remote identity and subscription protection, core.worktree escape refusal |
| tests/phase2/api.test.cjs | Real HTTP lifecycle, reference protection, unknown/force/path/ref input rejection and open API rejection |
| diagnostics/phase2/ui-smoke.cjs | Repository list/detail, initialize, refs, create/view Worktree, fetch, FF update, dirty update/delete refusal, clean delete, file-content assertions, no page errors |

The concurrency matrix uses a held real repository lock to exercise Fetch/Create/Delete/Prune refusal (all share the same serialization boundary), plus actual competing Fetch+Fetch and Update+Update promises. Cross-process owner tests validate that the boundary is not a Node-only mutex. Independent execution leases validate safe parallel occupancy. This does not claim every Git interleaving or network filesystem is certified.

## Compatibility and review

The existing schema test's ledger assertion changed from 18 to 19 and now asserts a single phase2-workspace entry; all prior data-preservation assertions remain. Existing Subscription/legacy clone/scripts copy/Task shell/ENV/dependency/Phase 1 resolver files have no diff against baseline. New code does not import a Task execution binding. An 18-file SHA-256 comparison is recorded in `diagnostics/phase2/legacy-integrity.json`.

GitNexus impact analysis preceded existing-symbol edits; HIGH/CRITICAL warnings were reported before the relevant changes. Reindex: 6,633 nodes, 15,883 edges, 390 flows at final implementation review. `detect_changes --scope compare --base-ref develop` reports HIGH, 8 tracked files, 20 symbols, 7 flows. It omits untracked new files from Git diff mapping; those were separately indexed, inspected and tested. The graph reports unresolved receivers and truncated flow enumeration, so absence of an edge is not proof of no impact. No commit was made.
