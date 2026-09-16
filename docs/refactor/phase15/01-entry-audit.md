# Phase15 Entry Audit

## Entry evidence

Entry SHA: `abd5939e316a918126cdadcf887ff7d756ab51db` (develop, clean at start).
Phase16A final Run [35098329236](https://github.com/anysoft/qinglong/actions/runs/35098329236): workflow_dispatch/full; all five jobs PASS. Core Ubuntu: 469/469/0/0; TS historical22/remaining4/new0. First failed run 35078896295 and subsequent normal run 35096852979 remain historical evidence. Phase16A final machine evidence is `diagnostics/phase16a/final-gates.json`.

## Current architecture / schema

Schema v9. Task/TaskSource/RuntimeBinding/ExecutionSettings own execution definitions. Trigger owns Cron/Webhook/GitUpdate input; Resolver freezes resources and Runner v2 executes. Workspace operates on canonical Worktree. Backup owns portable state and marks physical runtime/build missing after restore. No schema bump planned.

Local host Darwin arm64 / Node22.23.2. Raw tsc reproduced 22 errors (`diagnostics/phase15/typecheck-before.log`): 18 missing generated Umi exports plus 4 untyped UI callback parameters. Ubuntu previously reports only the latter four after frontend setup. Fix real type boundaries and generated API resolution; do not reduce strictness or introduce baseline exemptions.

## Bridges and product debt

Current registry `TEMPORARY_BRIDGES.md` contains historical layers through Phase12/14. B01 editor and B16 old backup normal paths exited but 410 routes remain. B02/B06/B08/B17 still have diagnostic shell/source adapters and tests. B03/B04/B15 have old scheduler/projection API consumers; official Task execution does not depend on them. B09/B10 still expose global dependency/bootstrap paths. B11/B12 system maintenance, B13 explicit script SDK/system notifications, B14 sync/system log retention must be classified by real ownership, not deleted by label.

Known Cron defect: scheduler selects CronTriggers by next_fire_at alone; TaskTrigger.enabled=false can still admit a SKIPPED event and advance time. Cron next_fire_at is NOT NULL in v9; use persisted enabled=false with frozen dormant timestamp plus enabled-only scheduler selection, and recompute at re-enable without replay. Transactions must serialize disable/tick.

## Linux-sensitive surfaces

Repository/worktree FD leases; runtime/environment build leases; task owner and notification dispatcher leases; backup barrier; process-group TERM/KILL; exec FD allowlist; no-replace rename and file/directory fsync; Unix socket execution submission; seven restore crash points; cross-process editor/execution/sync/restore exclusion. Reuse real Phase7/8/10/11/12/13/14 tests and add missing native gates. Darwin evidence is not Linux qualification.

## Impact and method

GitNexus force refreshed at entry SHA; bound repository/worktree is qinglong current checkout. NodeEnvironmentService CRITICAL (7 direct, 5 flows); BackupCoordinator HIGH (7 direct, 4 flows). Both remain protected pending evidence-backed need. RuntimeOperations/WorkspaceLocks/Restore MEDIUM; other selected owners LOW. Shell/dynamic launchers UNKNOWN: supplement with import/call search and executable tests. Full entry output: `diagnostics/phase15/entry-impact.json`; index reports flow-budget truncation, so absent graph edges are not proof of no consumers.

Read historical legacy contract, Phase0 risk register and current bridge registry. Required sequence: classify → cover formal invariants → focused removal/convergence → focused tests → full regression → hosted qualification. Do not delete user data or historical backup/log/Git material.

## Scope and final gate

Phase15: disabled Cron, bridge retirement/formalization, strict raw tsc zero, native Linux qualification scripts/workflow, architecture/docs, security/scale/recovery evidence. No Docker/Compose/Buildx/Release/tag/image/deployment/PAT/write permissions; Phase16B not started.

Local convergence can only yield PARTIAL / HOSTED_QUALIFICATION_PENDING. No push authorized. Final Phase15 PASS requires a new SHA and new ubuntu-24.04 qualification Run with foundation full, native/crash/security/type/bridge/artifact/cleanup all PASS. Phase16A's PASS is entry evidence only.
