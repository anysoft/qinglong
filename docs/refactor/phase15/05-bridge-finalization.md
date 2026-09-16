# Bridge ownership audit

This records final source/ownership dispositions. Full local browser and hosted qualification gates are recorded separately in the Phase15 report.
Historical Phase 0–14 reports remain immutable evidence. A decision below states the
required disposition; completion must be proved separately by source absence,
formal replacement coverage and regression. Existing user directories are never
removed by source cleanup. Schema remains v9.

| ID | Current file / symbol; original purpose | Production / test reachability | Replacement and owner | Decision |
|---|---|---|---|---|
| B01 | `api/script.ts`, `TaskExecutionSourceBridge`, bootstrap scripts copy; staging editor/source | Editor service was absent at entry. 410 router registered in `api/index`; source mapping remains diagnostic. Phase12 and API-file tests referenced tombstone. | CodeWorkspace owns direct Worktree editing; ExecutionResolver owns TaskSource resolution. Script router physically removed in Phase15; user scripts/bak untouched. | REMOVE_PHYSICALLY |
| B02 | `shell/task.sh`, `shell/otask.sh`, `taskExecution.ts`, TaskExecutionPreparationService; old language dispatcher | Normal launch rejects with 64. Phase5/runtime and platform ENV tests explicitly opt into recovery diagnostic. TaskHookLifecycle retains fallback. | ExecutionResolver → immutable context → RunnerV2; migrate complex four-language ENV, lifecycle and recovery assertions before deleting launcher. | REMOVE_PHYSICALLY |
| B03 | CurrentTaskBridgeService.setCrontab/autosave_crontab, scheduler helpers; system crontab output | Formal Task/Trigger no longer publish this projection; old service/API/tests still import it. | TriggerScheduler owns persisted Cron deadlines and TriggerEvents. | REMOVE_PHYSICALLY |
| B04 | ScheduleService, schedule gRPC transport, readiness probes; recurring internal work | Subscription.handleTask and initTask still schedule sync/system maintenance. Health probes actual transport. Old Cron RPC methods are separate legacy consumers. | Internal subscription/maintenance scheduler owns recurrence; keep transport/health only with real retained callers, remove old Cron RPC contract. | FORMALIZE_AS_REAL_INTERNAL_COMPONENT |
| B05 | Generated global language ENV | Already physically removed; no formal consumer. | TaskEnvironmentResolver and ExecutionContext snapshots. | REMOVE_PHYSICALLY |
| B06 | `shell/preload/*`, `task_env.sh`; implicit imports, accounts, package lookup | Diagnostic Shell execution; bootstrap copies SDK/preload. RunnerV2 never injects them. | Explicit managed Build plus immutable ENV, literal argv and Hooks. Preserve explicit SDK behavior under B13 only, not implicit loaders. | REMOVE_PHYSICALLY |
| B07 | SubscriptionDiscoveryAdapter/staging publication | Adapter and ManagedSubscription.stage already absent. Discovery tests now use Worktree and Tasks. | DiscoveryService owns stable identities, transactions and user overrides. | REMOVE_PHYSICALLY |
| B08 | `shell/api.sh`, `token.ts`, old `/crons/status` and dashboard record | Old route/RPC and diagnostic scripts; initTask still refreshes built-in token. Formal TaskRun supervision has dedicated result channel. | ExecutionAttemptCoordinator owns final result; authenticated public App API remains a separate security responsibility. | REMOVE_PHYSICALLY |
| B09 | DependenceService/API/UI, legacy install helpers | Still reachable administrative package management, initData interruption reset, system proxy/cache options. | RuntimeOperations + Python/Node Environment own task packages; platform OS tools require explicit bootstrap owner. Must not silently delete installing-operation recovery or OS tool duties. | REMOVE_PHYSICALLY |
| B10 | Global deps/dep_cache, NODE_PATH cache | Legacy bootstrap, preload and dependency management; no managed Runner dependency. | Private immutable Builds plus pip/npm artifact caches. User data remains protected and backed up until separately classified. | REMOVE_PHYSICALLY |
| B11 | config.sh/platform option readers | System options and maintenance consumers remain; public arbitrary Config editor already absent. | System settings owns validated platform options; Task Config assets and Hook output own execution configuration. Remove generated shell option coupling. | FORMALIZE_AS_REAL_INTERNAL_COMPONENT |
| B12 | `ql`, `task`, `qinglong` bins; update/share/start/rmlog | initTask and SystemService still invoke ql operations; npm bin exposes old entrypoints. | Explicit platform startup, retention and validated maintenance services; preserve timezone/shutdown/recovery before removing CLI glue. | REMOVE_PHYSICALLY |
| B13 | `sample/notify.*`, preload/client, backend NotificationService | Explicit script SDK plus login/system alerts remain; Task terminal notifications already use Outbox. | Notification owns typed result/system delivery; explicit SDK is optional source, never boot-injected or task dependency resolver. | FORMALIZE_AS_REAL_INTERNAL_COMPONENT |
| B14 | LogService, retention, subscription logs | Real Subscription/system log API and cleanup remain. Task logs use RunLogService and old cleaner excludes task-runs. | Sync/system log domains own their paths and retention; TaskRun owns task logs and cursor/follow. | FORMALIZE_AS_REAL_INTERNAL_COMPONENT |
| B15 | SchedulerProjection/RunningInstances/TaskStats/TaskViews; old execution facts | Old API/dashboard/grpc/initData still consult tables. Task API facade already queries TaskRuns only. | TaskRun owns live execution facts. Retain v9 historical schema/data integrity without live legacy domain behavior. TaskExecutionFacade is a formal Task API adapter. | REMOVE_PHYSICALLY |
| B16 | system/data export/import 410; old file backup | Full backup normal path and editor copies already replaced. Phase15 removes old system/data tombstone. No removal of existing bak files. | BackupCoordinator/RestoreService own consistent portable state; Workspace owns atomic file edit rollback. | REMOVE_PHYSICALLY |
| B17 | TaskWorkspaceResolver and config materialization lease | Resolver maps diagnostic scripts staging. ConfigMaterialization, Hook lifecycle and journal have real Runner consumers. configAssets import of resolver is unused. | ExecutionPaths/Worktree own identity; ConfigMaterialization owns journal, restoration and lease lifetime. Remove staging resolver while preserving the safety subsystem. | FORMALIZE_AS_REAL_INTERNAL_COMPONENT |

## Replacement evidence

- `tests/phase15/formal-environment.test.cjs`: real Shell Task complex values,
  UNSET, no interpolation, masking; 50 live Resolver/Runner processes and frozen A
  across changes to B. No diagnostic Shell dispatcher.
- `tests/phase15/managed-environment-invariants.cjs`: identical complex-value
  contract invoked by real managed Python, Node ESM and tsx tests.
- Existing Phase10 tests own immutable retry, timeout/cancel, Hook phases and
  result semantics. Existing Phase12/14 tests own workspace/backup recovery.
- Source absence and HTTP 404 replace the Script 410 contract.

## Impact caveats

GitNexus file edges and symbol edges are both reviewed. UNKNOWN callbacks and
dynamic fixture loading require manual searches. The Task API facade rename
preview covered two production files; subsequent text search found and updated
the Phase10 dynamic test loader. The source graph is bounded and cannot prove
absence of consumers on its own.


## Source and ownership exit result

Temporary source bridges remaining: **0**. This is not a hosted qualification PASS.
The full backup browser completion and new Ubuntu run remain separate gates.

| ID | Physical disposition / formal owner | Exit evidence |
|---|---|---|
| B01 | Script controller/UI/source mapper removed; bootstrap no longer copies SDK into scripts | Workspace browser; retired-source and fresh-directory tests |
| B02 | task.sh/otask/taskExecution/preparation/fallback physically removed | Formal lifecycle/ENV; real managed Python/Node/tsx and Shell |
| B03 | Cron service/controller, projection writers, add/del helpers and Cron RPC removed | Trigger suites, disabled-Cron regression, real Cron→TaskRun entrypoint |
| B04 | ScheduleService serves Subscription recurrence; mTLS ENV/notification and health have explicit contracts; old task/dependency queues removed | Internal scheduler drain/error tests; readiness/health/RPC boundaries |
| B05 | No global ENV generator; obsolete private environment.sh transport and startup cleanup removed too | Immutable Context/Hook tests, 50 live resolutions, secret transport tests |
| B06 | Implicit preload/loaders/account/task_env and preload clients removed | Four-language formal execution with literal environment |
| B07 | Staging/discovery adapter absent | Phase11 stable identity, overrides, tombstones and scale |
| B08 | Shell API, token.ts, builtin system App creation/refresh and old status consumers removed | Fresh seed produces no privileged App; TaskRun result/recovery suites |
| B09 | Global Dependency service/API/UI and install/mirror helpers removed | Managed Environment/Build lifecycle replaces package responsibilities; OS prerequisites are explicit operator/CI setup |
| B10 | Global NODE_PATH/cache source removed; bootstrap creates no deps/dep_cache | Source absence and existing-user-data preservation; Build import tests |
| B11 | Typed Settings owns title/language/timezone and log policy; no generated/sourced shell config | Fresh bootstrap and system/API regression |
| B12 | ql/start/update/share/env/check/pub/rmlog removed; npm bins and symlink loader removed | Fixed-argv foreground startup, existing supervision; typed retention service |
| B13 | Optional sample notification source and explicit backend system/login service retained; no implicit SDK or insecure preload fallback | Provider transport/gRPC tests; terminal Outbox remains independent |
| B14 | Run logs owned by RunLogService; Subscription log identity/retention and Winston system rotation formalized | Retention exclusions, path/UTF-8/drain tests, large Run logs |
| B15 | Live Cron/TaskView/stat/status services and startup resets removed; v9 historical storage preserved | Fresh schema no-rewrite, TaskRun/Observability suites; no active legacy model queries |
| B16 | Old system/data and update/data tombstones removed; Backup/Restore owns operations | Source/API removal, Phase14 consistency/crash suites; full browser and hosted gates reported separately |
| B17 | Staging TaskWorkspaceResolver removed; ConfigMaterialization/journal/FD lifetime retained | Config conflict/rollback/lifecycle, Workspace and Backup barrier tests |

No existing user directory or historical table is deleted. `test-disposition.json`
records removed implementation-only tests and formal replacements. Remaining
platform tests have explicit owners, not temporary classifications.


The obsolete Config comparison page and default config.sh/implicit QLAPI samples
are removed too: they referenced deleted Config controllers and were not a usable
independent comparison tool. Code Workspace owns current file/Git diff. Optional
`sample/notify.js` and `.py` remain explicit provider examples.
